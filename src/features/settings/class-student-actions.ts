/**
 * Class Student Actions Subsystem (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * RPC caller with client-side fallback for editing, removing, and adding students.
 */

import { rpc } from '../../data/supabase/rpc';
import { getSupabaseClient } from '../../data/supabase/client';
import type { FeatureContext } from '../../data/models/types';
import { parsePastedStudents } from '../../shared/student-validator';
import { sanitizeTc, isValidTcNumber } from '../../shared/tc-validator';
import { toast } from '../../shared/toast';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export async function handleConfirmEditStudent(
  listId: string,
  studentId: string,
  context: FeatureContext
): Promise<boolean> {
  const token = context.getState().session.token;
  const firstInput = $(`editStudentFirst-${studentId}`) as HTMLInputElement | null;
  const lastInput = $(`editStudentLast-${studentId}`) as HTMLInputElement | null;
  const tcInput = $(`editStudentTc-${studentId}`) as HTMLInputElement | null;

  const first = firstInput?.value.trim() || '';
  const last = lastInput?.value.trim() || '';
  const rawTc = tcInput?.value.trim() || '';
  const cleanTc = sanitizeTc(rawTc);

  if (!first || !last) {
    toast('İsim ve soyisim boş olamaz.');
    return false;
  }
  if (cleanTc && !isValidTcNumber(cleanTc)) {
    toast('Geçerli bir 11 haneli T.C. Kimlik No giriniz.');
    return false;
  }

  try {
    await rpc('update_student_in_list', {
      p_token: token,
      p_list_id: listId,
      p_student_id: studentId,
      p_first_name: first,
      p_last_name: last,
      p_tc_no: cleanTc || null
    });
    await context.refresh();
    toast('Öğrenci ve okul havuzu güncellendi.');
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e.message && (e.message.includes('schema cache') || e.message.includes('update_student_in_list'))) {
      try {
        const client = getSupabaseClient();
        await client.from('students').update({
          first_name: first,
          last_name: last,
          tc_no: cleanTc || null
        }).eq('id', studentId);

        if (cleanTc) {
          await client.from('school_students').update({
            first_name: first,
            last_name: last,
            tc_no: cleanTc
          }).eq('tc_no', cleanTc);
        }
        await context.refresh();
        toast('Öğrenci güncellendi (SQL betiğini çalıştırmayı unutmayın).');
        return true;
      } catch {
        // continue to error toast
      }
    }
    toast(e.message || 'Güncellenemedi.');
    return false;
  }
}

export async function handleRemoveStudentFromClass(
  listId: string,
  studentId: string,
  context: FeatureContext
): Promise<boolean> {
  if (
    typeof window !== 'undefined' &&
    !window.confirm('Öğrenci bu sınıftan çıkarılsın mı?\n(Okul havuzu kaydı korunur)')
  ) {
    return false;
  }
  const token = context.getState().session.token;
  try {
    await rpc('remove_student_from_list', {
      p_token: token,
      p_list_id: listId,
      p_student_id: studentId
    });
    await context.refresh();
    toast('Öğrenci sınıftan çıkarıldı.');
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e.message && (e.message.includes('schema cache') || e.message.includes('remove_student_from_list'))) {
      try {
        const client = getSupabaseClient();
        await client.from('students').delete().eq('id', studentId);
        await context.refresh();
        toast('Öğrenci sınıftan çıkarıldı.');
        return true;
      } catch {
        // fallback failed
      }
    }
    toast(e.message || 'Öğrenci çıkarılamadı.');
    return false;
  }
}

export async function handleAddSingleStudent(
  listId: string,
  context: FeatureContext
): Promise<boolean> {
  const token = context.getState().session.token;
  const firstInput = $(`classAddFirst-${listId}`) as HTMLInputElement | null;
  const lastInput = $(`classAddLast-${listId}`) as HTMLInputElement | null;
  const tcInput = $(`classAddTc-${listId}`) as HTMLInputElement | null;

  const first = firstInput?.value.trim() || '';
  const last = lastInput?.value.trim() || '';
  const cleanTc = sanitizeTc(tcInput?.value.trim() || '');

  if (!first || !last) {
    toast('İsim ve soyisim gerekli.');
    return false;
  }
  if (cleanTc && !isValidTcNumber(cleanTc)) {
    toast('Geçerli bir 11 haneli T.C. Kimlik No giriniz.');
    return false;
  }

  try {
    await rpc('add_student_to_list', {
      p_token: token,
      p_list_id: listId,
      p_first_name: first,
      p_last_name: last,
      p_tc_no: cleanTc || null
    });
    if (firstInput) firstInput.value = '';
    if (lastInput) lastInput.value = '';
    if (tcInput) tcInput.value = '';
    await context.refresh();
    toast('Öğrenci sınıfa ve havuza eklendi.');
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e.message && (e.message.includes('schema cache') || e.message.includes('add_student_to_list'))) {
      try {
        const client = getSupabaseClient();
        await client.from('students').insert({
          list_id: listId,
          first_name: first,
          last_name: last,
          tc_no: cleanTc || null
        });
        await client.from('school_students').insert({
          first_name: first,
          last_name: last,
          tc_no: cleanTc || null
        });
        if (firstInput) firstInput.value = '';
        if (lastInput) lastInput.value = '';
        if (tcInput) tcInput.value = '';
        await context.refresh();
        toast('Öğrenci sınıfa ve havuza eklendi.');
        return true;
      } catch {
        // fallback failed
      }
    }
    toast(e.message || 'Öğrenci eklenemedi.');
    return false;
  }
}

export async function handleAddPoolStudent(
  listId: string,
  poolId: string,
  context: FeatureContext
): Promise<boolean> {
  const token = context.getState().session.token;
  const pool = context.getState().roster.masterPool || [];
  const student = pool.find((s) => s.id === poolId);
  if (!student) return false;

  try {
    await rpc('add_student_to_list', {
      p_token: token,
      p_list_id: listId,
      p_first_name: student.firstName,
      p_last_name: student.lastName,
      p_tc_no: student.tcNo || null
    });
    await context.refresh();
    toast(`${student.firstName} ${student.lastName} sınıfa eklendi.`);
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    if (e.message && (e.message.includes('schema cache') || e.message.includes('add_student_to_list'))) {
      try {
        const client = getSupabaseClient();
        await client.from('students').insert({
          list_id: listId,
          first_name: student.firstName,
          last_name: student.lastName,
          tc_no: student.tcNo || null
        });
        await context.refresh();
        toast(`${student.firstName} ${student.lastName} sınıfa eklendi.`);
        return true;
      } catch {
        // fallback failed
      }
    }
    toast(e.message || 'Öğrenci eklenemedi.');
    return false;
  }
}

export async function handleBulkAddStudents(
  listId: string,
  context: FeatureContext
): Promise<boolean> {
  const token = context.getState().session.token;
  const pasteArea = $(`classPasteArea-${listId}`) as HTMLTextAreaElement | null;
  const rawText = pasteArea?.value.trim() || '';
  if (!rawText) {
    toast('Yapıştırılacak metin bulunamadı.');
    return false;
  }

  try {
    const parsed = parsePastedStudents(rawText);
    if (!parsed.length) {
      toast('Öğrenci tespit edilemedi.');
      return false;
    }
    await rpc('bulk_add_students_to_list', {
      p_token: token,
      p_list_id: listId,
      p_students: parsed
    });
    if (pasteArea) pasteArea.value = '';
    await context.refresh();
    toast(`${parsed.length} öğrenci sınıfa ve havuza eklendi.`);
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Öğrenciler eklenemedi.');
    return false;
  }
}
