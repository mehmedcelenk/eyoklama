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
import {
  renderPoolSelectorHtml,
  setupPoolInputListeners
} from './pool-selector';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Calculates number of attendance sessions recorded today for given class list.
 */
export function todayAttendanceCount(listId: string, state: AppState): number {
  const d = todayKey();
  return state.history.records.filter(
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

  const cardsHtml = state.roster.lists
    .map(
      (l) => {
        const courses = l.courses && l.courses.length ? l.courses : [];
        const coursesPills = courses.length
          ? `<div class="list-card-courses" style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06)">
              ${courses.map((c) => `<button type="button" class="btn tiny secondary" data-action="start-course-attendance" data-list-id="${escapeHtml(l.id)}" data-course="${escapeHtml(c)}" style="padding:2px 8px;font-size:0.75rem;min-height:26px" title="${escapeHtml(c)} yoklaması al">${escapeHtml(c)}</button>`).join('')}
             </div>`
          : '';

        return `<article id="listCard-${escapeHtml(l.id)}" class="list-card clickable"
          data-action="start-attendance" data-list-id="${escapeHtml(l.id)}" title="Yoklama al">
          <div style="width:100%">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <div>
                <h3 style="margin-bottom:2px;font-size:1.02rem">${escapeHtml(l.name)}</h3>
                <div class="muted tiny">${l.students.length} öğrenci · Bugün ${todayAttendanceCount(l.id, state)} yoklama</div>
              </div>
              <div class="muted tiny" style="font-weight:700;display:flex;align-items:center;gap:4px">
                <span style="opacity:0.6">${courses.length ? 'Ders Seç veya Yokla' : 'Yoklama Al'}</span>
                <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.2"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </div>
            ${coursesPills}
          </div>
        </article>`;
      }
    )
    .join('');

  const emptyHtml = `<div class="card" style="text-align:center;padding:32px 16px">
    <p class="muted" style="margin-bottom:12px">Henüz sınıf eklenmemiş.</p>
    <button type="button" class="btn small" data-action="switch-tab" data-tab="new">Yeni Sınıf Ekle</button>
  </div>`;

  const listsHtml = `
    <div class="lists-section stack">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 class="section-title" style="margin:0;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;color:var(--text)">SINIFLAR</h2>
      </div>
      <div class="grid">${cardsHtml || emptyHtml}</div>
    </div>
  `;

  listsPage.innerHTML = listsHtml + historySectionHtml;
}

/**
 * Renders the new class creation form into #newPage.
 */
export function renderNewListPage(context?: FeatureContext): void {
  setImportedStudents([]);
  const page = $('newPage');
  if (!page) return;

  const poolHtml = context ? renderPoolSelectorHtml(context) : '';

  page.innerHTML = `<div class="stack">

    <div class="plain-section">
      <label>Sınıf veya Ders Adı<input id="newListName" type="text" placeholder="Örn. 10-A Matematik"></label>
    </div>

    <div class="mode-toggle">
      <button id="poolModeBtn" class="active" type="button" data-action="set-student-mode" data-mode="pool">Havuzdan seç</button>
      <button id="fileModeBtn" type="button" data-action="set-student-mode" data-mode="file">Tablodan yükle</button>
      <button id="manualModeBtn" type="button" data-action="set-student-mode" data-mode="manual">Elle yükle</button>
    </div>

    <div id="poolMode" class="stack">
      <div id="poolSelectorMount">
        ${poolHtml}
      </div>
    </div>

    <div id="fileMode" class="stack hidden">
      <div class="file-help">
        <div class="muted tiny">Dosyada sütunlar: <b>İsim</b>, <b>Soyisim</b> ve isteğe bağlı <b>T.C. No</b>.</div>
        <div class="example-sheet" aria-label="Örnek öğrenci tablosu">
          <div><b>İsim</b><b>Soyisim</b><b>T.C. No</b></div>
          <div><span>Ahmet</span><span>Yılmaz</span><span>10000000146</span></div>
          <div class="last"><span>Mehmet</span><span>Kaya</span><span>-</span></div>
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
      <div class="manual-add" style="display:flex;gap:6px">
        <input id="manualFirst" type="text" placeholder="İsim" style="flex:1">
        <input id="manualLast" type="text" placeholder="Soyisim" style="flex:1">
        <input id="manualTc" type="text" placeholder="T.C. No (Opsiyonel)" maxlength="11" style="flex:1">
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

  if (context) {
    setupPoolInputListeners(context);
  }
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
      p_token: state.session.token,
      p_name: name,
      p_students: importedStudents
    })) as { id?: string; listId?: string };

    await context.refresh();
    toast('Sınıf oluşturuldu.');
    context.navigate('lists');

    const listId =
      res?.id ||
      res?.listId ||
      context.getState().roster.lists.find((x) => x.name === name)?.id;

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
