/**
 * Class List Student Import & Preview Module
 * Vibecoding-Safe Native DOM Architecture
 * Supports CSV (RFC-4180) and XLSX/XLS (SheetJS) file parsing
 */

import { parseCSV } from '../../shared/csv';
import { validateRows, parsePastedStudents } from '../../shared/student-validator';
import { fullName } from '../../shared/formatters';
import { escapeHtml } from '../../shared/sanitization';
import { toast } from '../../shared/toast';

let importedStudents: Array<{ firstName: string; lastName: string }> = [];

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Returns current staged roster of imported students.
 */
export function getImportedStudents(): Array<{ firstName: string; lastName: string }> {
  return importedStudents;
}

/**
 * Resets or updates staged roster.
 */
export function setImportedStudents(list: Array<{ firstName: string; lastName: string }>): void {
  importedStudents = list;
}

/**
 * Toggles between file table upload and manual student entry forms.
 */
export function setStudentMode(mode: 'file' | 'manual'): void {
  const isFile = mode === 'file';
  $('fileMode')?.classList.toggle('hidden', !isFile);
  $('manualMode')?.classList.toggle('hidden', isFile);
  $('fileModeBtn')?.classList.toggle('active', isFile);
  $('manualModeBtn')?.classList.toggle('active', !isFile);
}

/**
 * Adds student manually from manual inputs.
 */
export function addManualStudent(): void {
  const firstInput = $('manualFirst') as HTMLInputElement | null;
  const lastInput = $('manualLast') as HTMLInputElement | null;
  const first = firstInput?.value.trim() || '';
  const last = lastInput?.value.trim() || '';

  if (!first || !last) {
    toast('İsim ve Soyisim birlikte gerekli.');
    return;
  }

  importedStudents.push({ firstName: first, lastName: last });
  if (firstInput) firstInput.value = '';
  if (lastInput) lastInput.value = '';
  renderStudentPreview();
  firstInput?.focus();
}

/**
 * Parses and appends students pasted as text/table into manual roster.
 */
export function addPastedStudents(): void {
  const pasteArea = $('manualPasteArea') as HTMLTextAreaElement | null;
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
    importedStudents.push(...list);
    if (pasteArea) pasteArea.value = '';
    renderStudentPreview();
    toast(`${list.length} öğrenci listeye eklendi.`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Öğrenci listesi okunamadı.');
  }
}

/**
 * Removes an imported student by roster index.
 */
export function removeImportedStudent(idx: number): void {
  importedStudents.splice(idx, 1);
  renderStudentPreview();
}

/**
 * Renders the preview table and activates/deactivates the create list button.
 */
export function renderStudentPreview(): void {
  const p = $('preview');
  const b = $('createListBtn') as HTMLButtonElement | null;
  if (!p) return;

  if (b) {
    b.disabled = !importedStudents.length;
  }

  if (!importedStudents.length) {
    p.innerHTML = '';
    $('importMessage')?.classList.add('hidden');
    return;
  }

  importedStudents.sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr'));

  p.innerHTML = `<div class="preview-head">
    <strong class="tiny">${importedStudents.length} öğrenci hazır</strong>
    <span class="muted tiny">önizleme</span>
  </div>
  <div style="overflow:auto;max-height:260px">
    <table>
      <thead>
        <tr><th>İsim</th><th>Soyisim</th><th style="width:34px"></th></tr>
      </thead>
      <tbody>
        ${importedStudents
          .map(
            (s, i) => `<tr>
              <td>${escapeHtml(s.firstName)}</td>
              <td>${escapeHtml(s.lastName)}</td>
              <td style="text-align:right">
                <button type="button" class="icon-btn ghost" style="width:28px;height:28px;font-size:1.1rem;color:#777"
                  data-action="remove-imported-student" data-index="${i}" aria-label="Öğrenciyi çıkar" title="Kaldır">×</button>
              </td>
            </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

/**
 * Handles roster file upload (CSV or Excel).
 */
export async function handleFile(file: File | null | undefined): Promise<void> {
  const m = $('importMessage');
  const p = $('preview');
  const b = $('createListBtn') as HTMLButtonElement | null;
  importedStudents = [];
  if (p) p.innerHTML = '';
  if (b) b.disabled = true;
  if (!file) return;

  try {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: string[][];

    if (ext === 'csv') {
      rows = parseCSV(await file.text());
    } else if (ext === 'xlsx' || ext === 'xls') {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      if (typeof win.XLSX === 'undefined') {
        throw new Error('XLSX okuyucu yüklenemedi.');
      }
      const buffer = await file.arrayBuffer();
      const wb = win.XLSX.read(buffer, { type: 'array' });
      const sh = wb.Sheets[wb.SheetNames[0]];
      rows = win.XLSX.utils.sheet_to_json(sh, { header: 1, defval: '', raw: false });
    } else {
      throw new Error('Yalnızca CSV, XLSX veya XLS kabul edilir.');
    }

    importedStudents = validateRows(rows);
    if (m) {
      m.textContent = `${importedStudents.length} öğrenci dosyadan yüklendi.`;
      m.className = 'notice success';
      m.classList.remove('hidden');
    }
    renderStudentPreview();
  } catch (e: unknown) {
    const err = e as { message?: string };
    if (m) {
      m.textContent = err.message || 'Dosya okunamadı.';
      m.className = 'notice error';
      m.classList.remove('hidden');
    }
  }
}
