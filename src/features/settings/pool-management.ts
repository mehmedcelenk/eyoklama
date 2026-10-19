/**
 * Pool Management Component (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Allows search, inline editing (name, TC, class), deletion, and bulk import of school pool students.
 * Supports Pure Preview Mode, Symmetrical Add Mode (file/manual with class dropdown), and Edit Mode.
 */

import type { FeatureContext } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { normalizeSearchText } from '../../shared/formatters';
import {
  handleConfirmEditPoolStudent,
  handlePasteToPool,
  handleSingleToPool,
  handleDeleteFromPool,
  handlePoolFileUpload
} from './pool-actions';
import { renderPoolRowsHtml } from './pool-rows';

export {
  handlePasteToPool,
  handleSingleToPool,
  handleDeleteFromPool,
  handlePoolFileUpload,
  handleConfirmEditPoolStudent,
  renderPoolRowsHtml
};

let poolAdminSearchQuery = '';
let editingPoolStudentId: string | null = null;
let isPoolAdding = false;
let isPoolEditing = false;

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export function getEditingPoolStudentId(): string | null {
  return editingPoolStudentId;
}

export function setEditingPoolStudentId(id: string | null): void {
  editingPoolStudentId = id;
}

export function isPoolAddingMode(): boolean {
  return isPoolAdding;
}

export function setPoolAddingMode(adding: boolean): void {
  isPoolAdding = adding;
}

export function isPoolEditingMode(): boolean {
  return isPoolEditing;
}

export function setPoolEditingMode(editing: boolean): void {
  isPoolEditing = editing;
  if (!editing) editingPoolStudentId = null;
}

/**
 * Renders the School Pool Management section HTML for Admin Panel.
 */
export function renderPoolManagementHtml(context: FeatureContext): string {
  const state = context.getState();
  const pool = state.roster.masterPool || [];
  const q = normalizeSearchText(poolAdminSearchQuery);

  const filtered = pool.filter((s) => {
    if (!q) return true;
    const matchFirst = normalizeSearchText(s.firstName).includes(q);
    const matchLast = normalizeSearchText(s.lastName).includes(q);
    const matchClass = normalizeSearchText(s.classLabel || '').includes(q);
    const matchTc = (s.tcNo || '').includes(q);
    return matchFirst || matchLast || matchClass || matchTc;
  });

  const rowsHtml = renderPoolRowsHtml(filtered, isPoolEditing, editingPoolStudentId);

  const lists = state.roster.lists || [];
  const poolClasses = pool
    .map((s) => s.classLabel)
    .filter((c): c is string => Boolean(c && c.trim()));
  const allClassNames = Array.from(
    new Set([...lists.map((l) => l.name.trim()), ...poolClasses])
  ).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));

  const classSelectOptions = allClassNames
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('');

  const headerActionsHtml = `
    <div style="display:inline-flex;gap:6px;align-items:center">
      ${isPoolAdding
        ? `<button type="button" class="btn small secondary" data-action="cancel-pool-add" title="Vazgeç" aria-label="Vazgeç" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`
        : `<button type="button" class="btn small" data-action="start-pool-add" title="Öğrenci Ekle" aria-label="Öğrenci Ekle" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12h14"/><path d="M12 5v14"/></svg></button>`}
      ${isPoolEditing
        ? `<button type="button" class="btn small" data-action="stop-pool-edit" title="Tamam" aria-label="Tamam" style="background:#22c55e;color:#090909;border-color:#16a34a;display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12l4 4L19 6"/></svg></button>`
        : `<button type="button" class="btn small secondary" data-action="start-pool-edit" title="Düzenle" aria-label="Düzenle" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`}
    </div>
  `;

  const addBoxHtml = isPoolAdding
    ? `
      <div class="card stack" style="padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--line2);border-radius:10px;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="font-size:0.88rem">Yeni Öğrenci Ekle</strong>
            <div class="muted tiny">Bilgileri girip ekleyin veya dosyadan yükleyin</div>
          </div>
          <div>
            <label class="file-picker" for="poolFileInput" style="padding:6px 12px;font-size:0.82rem;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
              <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Dosyadan Yükle (.csv, .xlsx)</span>
            </label>
            <input id="poolFileInput" type="file" accept=".csv,.xlsx,.xls" style="display:none">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="min-width:0">
            <input id="poolAddFirst" type="text" placeholder="İsim *" autocomplete="off"
              style="width:100%;box-sizing:border-box;min-height:38px;padding:6px 10px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
          </div>
          <div style="min-width:0">
            <input id="poolAddLast" type="text" placeholder="Soyisim *" autocomplete="off"
              style="width:100%;box-sizing:border-box;min-height:38px;padding:6px 10px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1.2fr 1fr auto;gap:8px;align-items:center">
          <div style="min-width:0">
            <input id="poolAddTc" type="text" placeholder="T.C. No (Opsiyonel)" maxlength="11" autocomplete="off"
              style="width:100%;box-sizing:border-box;min-height:38px;padding:6px 10px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
          </div>
          <div style="min-width:0">
            <select id="poolAddClass"
              style="width:100%;box-sizing:border-box;min-height:38px;padding:6px 8px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
              <option value="">Şube Seç (Opsiyonel)</option>
              ${classSelectOptions}
            </select>
          </div>
          <div>
            <button type="button" class="btn small" data-action="save-single-to-pool" title="Havuza Ekle" aria-label="Havuza Ekle"
              style="min-height:38px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;background:var(--accent,#22c55e);color:#090909;font-weight:700">
              <svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            </button>
          </div>
        </div>
      </div>
    `
    : '';

  return `
    <div class="stack">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px">
        <div style="display:flex;align-items:center;gap:6px">
          <strong style="font-size:0.95rem">Okul Öğrenci Havuzu</strong>
          <span class="badge tiny" style="font-weight:600">${pool.length} Öğrenci</span>
        </div>
        ${headerActionsHtml}
      </div>

      <div class="muted tiny">
        Tüm okul öğrencilerini bu havuza yükleyebilir, silebilir veya düzenleyebilirsiniz. Değişiklikler sınıflara otomatik senkronize edilir.
      </div>

      ${addBoxHtml}

      <div class="pool-admin-search stack" style="margin-top:6px">
        <input id="poolAdminSearchInput" type="text" placeholder="Havuzda ara (İsim, T.C., Şube)..." value="${escapeHtml(poolAdminSearchQuery)}"
          style="width:100%;box-sizing:border-box;font-size:0.85rem;padding:6px">
      </div>

      <div class="pool-admin-list" id="poolAdminList">
        ${rowsHtml}
        ${filtered.length > 50 ? `<div class="muted tiny" style="text-align:center;padding:6px">+ ${filtered.length - 50} öğrenci daha var (filtreleyin)</div>` : ''}
      </div>
    </div>
  `;
}

/**
 * Handles pool-related actions from central event delegation.
 */
export async function handlePoolAdminAction(
  action: string,
  ds: DOMStringMap,
  context: FeatureContext
): Promise<boolean> {
  if (action === 'start-pool-add') {
    isPoolAdding = true;
    isPoolEditing = false;
    return true;
  }
  if (action === 'cancel-pool-add') {
    isPoolAdding = false;
    return true;
  }
  if (action === 'toggle-pool-add') {
    isPoolAdding = !isPoolAdding;
    if (isPoolAdding) isPoolEditing = false;
    return true;
  }
  if (action === 'start-pool-edit') {
    isPoolEditing = true;
    isPoolAdding = false;
    return true;
  }
  if (action === 'stop-pool-edit' || action === 'cancel-pool-edit') {
    isPoolEditing = false;
    editingPoolStudentId = null;
    return true;
  }
  if (action === 'toggle-pool-edit') {
    isPoolEditing = !isPoolEditing;
    if (!isPoolEditing) editingPoolStudentId = null;
    if (isPoolEditing) isPoolAdding = false;
    return true;
  }
  if (action === 'start-edit-pool-student' && ds.studentId) {
    editingPoolStudentId = ds.studentId;
    return true;
  }
  if (action === 'cancel-edit-pool-student') {
    editingPoolStudentId = null;
    return true;
  }
  if (action === 'confirm-edit-pool-student' && ds.studentId) {
    const ok = await handleConfirmEditPoolStudent(ds.studentId, context);
    if (ok) editingPoolStudentId = null;
    return true;
  }
  return false;
}

/**
 * Sets up non-inline input listeners for the pool admin manager.
 */
export function setupPoolManagementListeners(context: FeatureContext, _renderCb?: () => void): void {
  const searchInput = $('poolAdminSearchInput') as HTMLInputElement | null;
  if (searchInput) {
    searchInput.oninput = () => {
      poolAdminSearchQuery = searchInput.value;
      const listEl = $('poolAdminList');
      if (!listEl) return;
      const pool = context.getState().roster.masterPool || [];
      const q = normalizeSearchText(poolAdminSearchQuery);
      const filtered = pool.filter((s) => {
        if (!q) return true;
        return (
          normalizeSearchText(s.firstName).includes(q) ||
          normalizeSearchText(s.lastName).includes(q) ||
          normalizeSearchText(s.classLabel || '').includes(q) ||
          (s.tcNo || '').includes(q)
        );
      });
      listEl.innerHTML =
        renderPoolRowsHtml(filtered, isPoolEditing, editingPoolStudentId) +
        (filtered.length > 50
          ? `<div class="muted tiny" style="text-align:center;padding:6px">+ ${filtered.length - 50} öğrenci daha var (filtreleyin)</div>`
          : '');
    };
  }

  const fileInput = $('poolFileInput') as HTMLInputElement | null;
  if (fileInput) {
    fileInput.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const f = target.files?.[0];
      handlePoolFileUpload(f, context);
    };
  }
}
