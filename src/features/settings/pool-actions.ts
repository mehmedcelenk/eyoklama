/**
 * School Student Pool Actions (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Handles bulk import, single add, inline update, delete, and file upload for master pool.
 */

import { rpc } from '../../data/supabase/rpc';
import { getSupabaseClient } from '../../data/supabase/client';
import type { FeatureContext } from '../../data/models/types';
import { parsePastedStudents } from '../../shared/student-validator';
import { parseCSV } from '../../shared/csv';
import { sanitizeTc, isValidTcNumber } from '../../shared/tc-validator';
import { toast } from '../../shared/toast';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Handles editing and saving an existing school pool student.
 */
export async function handleConfirmEditPoolStudent(
  studentId: string,
  context: FeatureContext
): Promise<boolean> {
  const token = context.getState().session.token;
  const firstInput = $(`editPoolFirst-${studentId}`) as HTMLInputElement | null;
  const lastInput = $(`editPoolLast-${studentId}`) as HTMLInputElement | null;
  const tcInput = $(`editPoolTc-${studentId}`) as HTMLInputElement | null;
  const classInput = $(`editPoolClass-${studentId}`) as HTMLInputElement | null;

  const first = firstInput?.value.trim() || '';
  const last = lastInput?.value.trim() || '';
  const cleanTc = sanitizeTc(tcInput?.value.trim() || '');
  const classLabel = classInput?.value.trim() || '';

  if (!first || !last) {
    toast('İsim ve soyisim boş olamaz.');
    return false;
  }
  if (cleanTc && !isValidTcNumber(cleanTc)) {
    toast('Geçerli bir 11 haneli T.C. Kimlik No giriniz.');
    return false;
  }

  try {
    await rpc('update_school_student', {
      p_token: token,
      p_student_id: studentId,
      p_first_name: first,
      p_last_name: last,
      p_tc_no: cleanTc || null,
      p_class_label: classLabel || null
    });
    await context.refresh();
    toast('Öğrenci havuzda ve ilgili sınıflarda güncellendi.');
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e.message && (e.message.includes('schema cache') || e.message.includes('update_school_student'))) {
      try {
        const client = getSupabaseClient();
        await client.from('school_students').update({
          first_name: first,
          last_name: last,
          tc_no: cleanTc || null,
          class_label: classLabel || null
        }).eq('id', studentId);

        if (cleanTc) {
          await client.from('students').update({
            first_name: first,
            last_name: last,
            tc_no: cleanTc
          }).eq('tc_no', cleanTc);
        }
        await context.refresh();
        toast('Öğrenci havuzda güncellendi.');
        return true;
      } catch {
        // fallback failed
      }
    }
    toast(e.message || 'Öğrenci güncellenemedi.');
    return false;
  }
}

/**
 * Handles bulk pasting students into the school pool.
 */
export async function handlePasteToPool(context: FeatureContext): Promise<void> {
  const pasteArea = $('poolPasteArea') as HTMLTextAreaElement | null;
  const rawText = pasteArea?.value.trim() || '';
  if (!rawText) {
    toast('Yapıştırılacak metin bulunamadı.');
    return;
  }

  try {
    const list = parsePastedStudents(rawText);
    if (!list.length) {
      toast('Metinde öğrenci tespit edilemedi.');
      return;
    }

    const token = context.getState().session.token;
    await rpc('upsert_school_students', {
      p_token: token,
      p_students: list
    });

    if (pasteArea) pasteArea.value = '';
    await context.refresh();
    toast(`${list.length} öğrenci okul havuzuna kaydedildi.`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Havuza eklenemedi.');
  }
}

/**
 * Handles single student add into the school pool (with optional T.C. No).
 */
export async function handleSingleToPool(context: FeatureContext): Promise<void> {
  const firstInput = $('poolAddFirst') as HTMLInputElement | null;
  const lastInput = $('poolAddLast') as HTMLInputElement | null;
  const tcInput = $('poolAddTc') as HTMLInputElement | null;
  const classInput = $('poolAddClass') as HTMLInputElement | null;

  const first = firstInput?.value.trim() || '';
  const last = lastInput?.value.trim() || '';
  const cleanTc = sanitizeTc(tcInput?.value.trim() || '');
  const cLabel = classInput?.value.trim() || '';

  if (!first || !last) {
    toast('İsim ve soyisim gerekli.');
    return;
  }
  if (cleanTc && !isValidTcNumber(cleanTc)) {
    toast('Geçerli bir 11 haneli T.C. Kimlik No giriniz.');
    return;
  }

  try {
    const token = context.getState().session.token;
    await rpc('upsert_school_students', {
      p_token: token,
      p_students: [
        {
          firstName: first,
          lastName: last,
          tcNo: cleanTc || undefined,
          classLabel: cLabel || undefined
        }
      ]
    });

    if (firstInput) firstInput.value = '';
    if (lastInput) lastInput.value = '';
    if (tcInput) tcInput.value = '';
    if (classInput) classInput.value = '';
    await context.refresh();
    toast(`${first} ${last} havuza eklendi.`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Öğrenci eklenemedi.');
  }
}

/**
 * Handles single student delete from the school pool.
 */
export async function handleDeleteFromPool(studentId: string, context: FeatureContext): Promise<void> {
  if (!studentId) return;
  if (
    typeof window !== 'undefined' &&
    !window.confirm('Bu öğrenci okul havuzundan silinsin mi?')
  ) {
    return;
  }
  try {
    const token = context.getState().session.token;
    await rpc('delete_school_student', {
      p_token: token,
      p_student_id: studentId
    });
    await context.refresh();
    toast('Öğrenci havuzdan silindi.');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Öğrenci silinemedi.');
  }
}

/**
 * Handles file upload into the school pool.
 */
export async function handlePoolFileUpload(file: File | undefined, context: FeatureContext): Promise<void> {
  if (!file) return;
  try {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: string[][];

    if (ext === 'xlsx' || ext === 'xls') {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      if (typeof win.XLSX === 'undefined') throw new Error('XLSX okuyucu bulunamadı.');
      const buffer = await file.arrayBuffer();
      const wb = win.XLSX.read(buffer, { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      rows = win.XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }

    const students: Array<{ firstName: string; lastName: string; tcNo?: string; classLabel?: string }> = [];
    rows.forEach((r) => {
      const f = (r[0] || '').trim();
      const l = (r[1] || '').trim();
      if (!f || !l || f.toLowerCase() === 'isim' || f.toLowerCase() === 'ad') return;
      const extra = (r[2] || '').trim();
      const isTc = extra.replace(/\D/g, '').length === 11;
      students.push({
        firstName: f,
        lastName: l,
        tcNo: isTc ? sanitizeTc(extra) : undefined,
        classLabel: !isTc && extra ? extra : undefined
      });
    });

    if (!students.length) {
      toast('Dosyada geçerli öğrenci bulunamadı.');
      return;
    }

    const token = context.getState().session.token;
    await rpc('upsert_school_students', {
      p_token: token,
      p_students: students
    });

    await context.refresh();
    toast(`${students.length} öğrenci dosyadan havuza aktarıldı.`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Dosya okunamadı.');
  }
}
