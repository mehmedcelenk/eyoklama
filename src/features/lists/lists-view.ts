/**
 * Class Lists Feature View & Creator
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AppState } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { todayKey, dayKey } from '../../shared/date';
import { toast } from '../../shared/toast';
import {
  setImportedStudents,
  getImportedStudents,
  handleFile,
  addManualStudent
} from './import-roster';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Calculates number of attendance sessions recorded today for given class list.
 */
export function todayAttendanceCount(listId: string, state: AppState): number {
  const d = todayKey();
  return state.history.filter(
    (h) => !h.archivedAt && h.listId === listId && dayKey(h.takenAt) === d
  ).length;
}

/**
 * Renders class packages list into #listsPage along with the history section.
 */
export function renderListsView(context: FeatureContext, historySectionHtml: string): void {
  const state = context.getState();
  const listsPage = $('listsPage');
  if (!listsPage) return;

  const cardsHtml = state.lists
    .map(
      (l) => `<article id="listCard-${escapeHtml(l.id)}" class="list-card clickable"
        data-action="start-attendance" data-list-id="${escapeHtml(l.id)}" title="Yoklama al">
        <div>
          <h3 style="margin-bottom:2px">${escapeHtml(l.name)}</h3>
          <div class="muted tiny">${l.students.length} öğrenci · Bugün ${todayAttendanceCount(l.id, state)} yoklama</div>
        </div>
      </article>`
    )
    .join('');

  const emptyHtml = `<div class="card" style="text-align:center;padding:32px 16px">
    <p class="muted" style="margin-bottom:12px">Henüz sınıf eklenmemiş.</p>
    <button type="button" class="btn small" data-action="switch-tab" data-tab="new">Yeni Sınıf Ekle</button>
  </div>`;

  const listsHtml = `
    <div class="lists-section stack">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="section-title" style="margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;color:var(--text)">YOKLAMA PAKETLERİ</h2>
      </div>
      <div class="grid">${cardsHtml || emptyHtml}</div>
    </div>
  `;

  listsPage.innerHTML = listsHtml + historySectionHtml;
}

/**
 * Renders the new class creation form into #newPage.
 */
export function renderNewListPage(_context?: FeatureContext): void {
  setImportedStudents([]);
  const page = $('newPage');
  if (!page) return;

  page.innerHTML = `<div class="stack">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <button type="button" class="top-icon-btn" data-action="switch-tab" data-tab="lists" title="Geri">
        <svg viewBox="0 0 24 24"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <h1 class="page-title" style="margin:0">YOKLAMA EKLE</h1>
    </div>

    <div class="plain-section">
      <label>Sınıf adı<input id="newListName" type="text" placeholder="Örn. TDE Joker"></label>
    </div>

    <div class="mode-toggle">
      <button id="fileModeBtn" class="active" type="button" data-action="set-student-mode" data-mode="file">Tablodan yükle</button>
      <button id="manualModeBtn" type="button" data-action="set-student-mode" data-mode="manual">Elle yükle</button>
    </div>

    <div id="fileMode" class="stack">
      <div class="file-help">
        <div class="muted tiny">Dosyada yalnızca 2 sütun olsun: <b>İsim</b> ve <b>Soyisim</b>.</div>
        <div class="example-sheet" aria-label="Örnek öğrenci tablosu">
          <div><b>İsim</b><b>Soyisim</b></div>
          <div><span>Ahmet</span><span>Yılmaz</span></div>
          <div class="last"><span>Mehmet Ali</span><span>Kaya</span></div>
        </div>
        <div class="file-picker-row">
          <span id="fileName" class="muted tiny">Dosya seçilmedi</span>
          <label class="file-picker" for="studentFile">
            <svg viewBox="0 0 24 24"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/></svg>
            Dosya seç
          </label>
          <input id="studentFile" class="file-input" type="file" accept=".csv,.xlsx,.xls">
        </div>
      </div>
    </div>

    <div id="manualMode" class="stack hidden">
      <div class="manual-add">
        <input id="manualFirst" type="text" placeholder="İsim">
        <input id="manualLast" type="text" placeholder="Soyisim">
        <button type="button" class="icon-btn" data-action="add-manual-student" aria-label="Öğrenci ekle" title="Öğrenci ekle">+</button>
      </div>

      <div class="stack" style="margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--border-color, #333);">
        <label style="font-size: 0.82rem; color: var(--text-muted, #888);">veya Tablo / Liste Yapıştır (Excel, Word, Metin):</label>
        <textarea id="manualPasteArea" rows="3" placeholder="Örnek:
Ahmet	YILMAZ
Mehmet	KAYA
(İki sütun kopyalayıp buraya yapıştırabilirsiniz)" style="width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; font-size: 0.85rem; padding: 6px; border-radius: 6px; background: rgba(255,255,255,0.05); color: inherit; border: 1px solid var(--border-color, #444);"></textarea>
        <button type="button" class="btn secondary" data-action="add-pasted-students" style="font-size: 0.85rem; padding: 6px 12px; align-self: flex-start;">Yapıştırılanları Listeye Ekle</button>
      </div>
    </div>

    <div id="importMessage" class="notice hidden"></div>
    <div id="preview"></div>
    <button id="createListBtn" type="button" class="btn" data-action="create-list" disabled>Sınıfı oluştur</button>
  </div>`;

  const fileInput = $('studentFile') as HTMLInputElement | null;
  if (fileInput) {
    fileInput.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const f = target.files?.[0];
      const fnEl = $('fileName');
      if (fnEl) fnEl.textContent = f?.name || 'Dosya seçilmedi';
      handleFile(f);
    };
  }

  ['manualFirst', 'manualLast'].forEach((id) => {
    $(id)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        addManualStudent();
      }
    });
  });
}

/**
 * Creates class list via create_list RPC.
 */
export async function createList(context: FeatureContext): Promise<void> {
  const state = context.getState();
  const nameInput = $('newListName') as HTMLInputElement | null;
  const name = nameInput?.value.trim() || '';
  const importedStudents = getImportedStudents();

  if (!name) {
    toast('Sınıf adını yazın.');
    return;
  }
  if (!importedStudents.length) {
    toast('En az bir öğrenci ekleyin.');
    return;
  }

  try {
    const res = (await rpc('create_list', {
      p_token: state.token,
      p_name: name,
      p_students: importedStudents
    })) as { id?: string; listId?: string };

    await context.refresh();
    toast('Sınıf oluşturuldu.');
    context.navigate('lists');

    const listId =
      res?.id ||
      res?.listId ||
      context.getState().lists.find((x) => x.name === name)?.id;

    if (listId) {
      const el = $(`listCard-${listId}`);
      if (el) {
        el.classList.add('highlight-card');
        setTimeout(() => el.classList.remove('highlight-card'), 2500);
      }
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Sınıf oluşturulamadı.');
  }
}
