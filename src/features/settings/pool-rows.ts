/**
 * Pool Rows Renderer (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Renders individual student items in school pool (Pure preview, edit mode, inline editing).
 */

import type { MasterStudent } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';

/**
 * Renders list rows for school pool students.
 * In pure preview mode, no edit/delete buttons are rendered.
 * In edit mode, inline edit form or edit/delete buttons are rendered.
 */
export function renderPoolRowsHtml(
  students: MasterStudent[],
  editing: boolean,
  currentEditId: string | null
): string {
  if (!students.length) {
    return `<div class="muted tiny" style="padding:12px;text-align:center">Öğrenci bulunamadı.</div>`;
  }

  return students
    .slice(0, 50)
    .map((s) => {
      if (editing && currentEditId === s.id) {
        return `
          <div class="pool-admin-edit-row" style="display:flex;gap:6px;align-items:center;padding:8px;background:rgba(255,255,255,0.06);border-radius:6px;margin-bottom:4px;flex-wrap:wrap;min-width:0;overflow-x:hidden">
            <input id="editPoolFirst-${s.id}" type="text" value="${escapeHtml(s.firstName)}" placeholder="İsim" style="flex:1;min-width:70px">
            <input id="editPoolLast-${s.id}" type="text" value="${escapeHtml(s.lastName)}" placeholder="Soyisim" style="flex:1;min-width:70px">
            <input id="editPoolTc-${s.id}" type="text" value="${escapeHtml(s.tcNo || '')}" placeholder="T.C. No (11 hane)" maxlength="11" style="flex:1;min-width:90px">
            <input id="editPoolClass-${s.id}" type="text" value="${escapeHtml(s.classLabel || '')}" placeholder="Şube (Örn. 10-A)" style="flex:1;min-width:70px">
            <div style="display:flex;gap:4px;flex-shrink:0">
              <button type="button" class="icon-btn" data-action="confirm-edit-pool-student" data-student-id="${escapeHtml(s.id)}"
                title="Kaydet ve Senkronize Et" style="color:var(--accent,#22c55e);width:32px;height:32px">
                <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
              </button>
              <button type="button" class="icon-btn" data-action="cancel-edit-pool-student" title="İptal" style="width:32px;height:32px">
                <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <div class="muted tiny" style="width:100%;color:var(--accent,#22c55e)">✓ Değişiklikler ilgili sınıflara otomatik yansıtılır.</div>
          </div>`;
      }

      const actionsHtml = editing
        ? `
          <div class="pool-admin-actions">
            <button type="button" class="icon-btn" data-action="start-edit-pool-student" data-student-id="${escapeHtml(s.id)}"
              aria-label="Öğrenciyi düzenle" title="Düzenle (İsim / T.C. / Şube)" style="width:32px;height:32px">
              <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>
            </button>
            <button type="button" class="icon-btn danger" data-action="delete-pool-student" data-student-id="${escapeHtml(s.id)}"
              aria-label="Öğrenciyi sil" title="Havuzdan sil" style="width:32px;height:32px">
              <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v6M14 10v6"/></svg>
            </button>
          </div>`
        : '';

      return `
        <div class="pool-admin-item">
          <div class="pool-admin-item-info">
            <strong style="text-overflow:ellipsis;overflow:hidden">${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong>
            ${s.classLabel ? `<span class="badge tiny" style="flex-shrink:0">${escapeHtml(s.classLabel)}</span>` : ''}
            ${s.tcNo ? `<span class="muted tiny" style="flex-shrink:0">${escapeHtml(s.tcNo)}</span>` : `<span class="muted tiny" style="opacity:0.55;flex-shrink:0">T.C. yok</span>`}
          </div>
          ${actionsHtml}
        </div>`;
    })
    .join('');
}
