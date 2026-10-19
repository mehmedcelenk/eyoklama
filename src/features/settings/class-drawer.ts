/**
 * Class Drawer Component (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Horizontal action drawer & Lucide SVG borderless icon buttons.
 */

import type { FeatureContext, ClassList } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { normalizeSearchText } from '../../shared/formatters';

export type ClassDrawerMode =
  | 'none'
  | 'add-course'
  | 'student-menu'
  | 'student-pool'
  | 'student-manual'
  | 'student-file'
  | 'rename-class';

export const ICONS = {
  chevronLeft: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
  plus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  bookPlus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/><path d="M10 14h4"/><path d="M12 12v4"/></svg>`,
  userPlus: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
  users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  fileUp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>`,
  pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>`,
  x: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
};

export function renderClassDrawer(
  list: ClassList,
  mode: ClassDrawerMode,
  context: FeatureContext,
  showFirstName: boolean,
  poolQuery: string,
  isAdmin: boolean = false
): string {
  if (mode === 'add-course') {
    return `<div style="display:flex;gap:6px;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)">
      <input id="newCourseInput-${escapeHtml(list.id)}" type="text" placeholder="Ders adı (Örn: Matematik)" style="flex:1;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
      <button type="button" class="icon-btn ghost" data-action="add-class-course" data-list-id="${escapeHtml(list.id)}" title="Ders Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#fff">${ICONS.plus}</button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="none" title="Kapat" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">${ICONS.chevronLeft}</button>
    </div>`;
  }

  if (mode === 'student-menu') {
    return `<div style="display:flex;gap:4px;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)">
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-pool" title="Havuzdan Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
        ${ICONS.users}
      </button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-manual" title="Elle Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
        ${ICONS.userPlus}
      </button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-file" title="Dosya / Yapıştır" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
        ${ICONS.fileUp}
      </button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="none" title="Geri" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa;margin-left:auto">${ICONS.chevronLeft}</button>
    </div>`;
  }

  if (mode === 'student-manual') {
    return `<div style="display:flex;gap:6px;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">
      <input id="classAddFirst-${escapeHtml(list.id)}" type="text" placeholder="İsim" style="flex:1;min-width:70px;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
      <input id="classAddLast-${escapeHtml(list.id)}" type="text" placeholder="Soyisim" style="flex:1;min-width:70px;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
      <input id="classAddTc-${escapeHtml(list.id)}" type="text" placeholder="T.C. No (Opsiyonel)" maxlength="11" style="flex:1;min-width:90px;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
      <button type="button" class="icon-btn ghost" data-action="add-student-to-class" data-list-id="${escapeHtml(list.id)}" title="Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#fff">${ICONS.plus}</button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-menu" title="Geri" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">${ICONS.chevronLeft}</button>
    </div>`;
  }

  if (mode === 'student-pool') {
    const existing = new Set(list.students.map((s) => `${s.firstName.toLowerCase()}_${s.lastName.toLowerCase()}`));
    const pool = context.getState().roster.masterPool || [];
    const pq = normalizeSearchText(poolQuery);
    const candidates = pool.filter((p) => {
      const k = `${p.firstName.toLowerCase()}_${p.lastName.toLowerCase()}`;
      if (existing.has(k)) return false;
      return !pq || normalizeSearchText(`${p.firstName} ${p.lastName}`).includes(pq) || (p.tcNo && p.tcNo.includes(pq));
    });

    const poolRows = candidates.length
      ? candidates.slice(0, 15).map((p) => `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div><strong>${escapeHtml(p.firstName)} ${escapeHtml(p.lastName)}</strong>${p.tcNo ? `<span class="badge tiny" style="margin-left:4px">${escapeHtml(p.tcNo)}</span>` : ''}</div>
          <button type="button" class="icon-btn ghost" data-action="add-pool-student-to-class" data-list-id="${escapeHtml(list.id)}" data-pool-id="${escapeHtml(p.id)}" title="Sınıfa Ekle" style="width:28px;height:28px;display:grid;place-items:center;border:none;background:transparent;color:#fff">${ICONS.plus}</button>
        </div>`).join('')
      : `<div class="muted tiny" style="padding:6px;text-align:center">Havuzda eklenebilecek öğrenci yok.</div>`;

    return `<div class="stack" style="padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);gap:6px">
      <div style="display:flex;gap:6px;align-items:center">
        <input id="classPoolSearchInput-${escapeHtml(list.id)}" type="text" placeholder="Havuzda ara (İsim veya TC)..." value="${escapeHtml(poolQuery)}" style="flex:1;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
        <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-menu" title="Geri" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">${ICONS.chevronLeft}</button>
      </div>
      <div class="hide-scrollbar" style="max-height:140px;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none">${poolRows}</div>
    </div>`;
  }

  if (mode === 'student-file') {
    return `<div class="stack" style="padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);gap:6px">
      <textarea id="classPasteArea-${escapeHtml(list.id)}" rows="2" placeholder="Ahmet\tYILMAZ\t10000000146..." style="width:100%;box-sizing:border-box;font-size:0.8rem;padding:6px;border-radius:6px;background:rgba(255,255,255,0.05);color:inherit;border:1px solid rgba(255,255,255,0.08)"></textarea>
      <div style="display:flex;gap:6px;align-items:center">
        <button type="button" class="icon-btn ghost" data-action="bulk-add-students-to-class" data-list-id="${escapeHtml(list.id)}" title="Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#fff">
          ${ICONS.plus}
        </button>
        <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-menu" title="Geri" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa;margin-left:auto">${ICONS.chevronLeft}</button>
      </div>
    </div>`;
  }

  if (mode === 'rename-class') {
    return `<div style="display:flex;gap:6px;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)">
      <input id="className-${escapeHtml(list.id)}" type="text" value="${escapeHtml(list.name)}" maxlength="120" style="flex:1;min-height:30px;font-size:0.85rem;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:inherit;padding:0 8px">
      <button type="button" class="icon-btn ghost" data-action="confirm-rename-list" data-list-id="${escapeHtml(list.id)}" title="Kaydet" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#fff">${ICONS.check}</button>
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="none" title="Kapat" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">${ICONS.chevronLeft}</button>
    </div>`;
  }

  // Default 'none' action bar with borderless icon buttons
  return `<div style="display:flex;gap:4px;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)">
    <button type="button" class="icon-btn ghost" data-action="toggle-class-student-ad" title="${showFirstName ? 'Ad ve Soyad gösteriliyor' : 'Sadece Soyad gösteriliyor'}" style="width:auto;padding:0 6px;height:30px;font-size:0.75rem;font-weight:${showFirstName ? '800' : '500'};color:${showFirstName ? '#fff' : '#666'};border:none;background:transparent;cursor:pointer">AD</button>
    <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="add-course" title="Ders Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
      ${ICONS.bookPlus}
    </button>
    <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="student-menu" title="Öğrenci Ekle" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
      ${ICONS.userPlus}
    </button>
    <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
      <button type="button" class="icon-btn ghost" data-action="set-class-drawer" data-drawer="rename-class" title="Sınıf Adını Değiştir" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">
        ${ICONS.pencil}
      </button>
      ${
        isAdmin
          ? `<button type="button" class="icon-btn ghost" data-action="delete-list" data-list-id="${escapeHtml(list.id)}" title="Sınıfı Sil" style="width:30px;height:30px;display:grid;place-items:center;border:none;background:transparent;color:#e55353">
        ${ICONS.trash}
      </button>`
          : ''
      }
    </div>
  </div>`;
}
