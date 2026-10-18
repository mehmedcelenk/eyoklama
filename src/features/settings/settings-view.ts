/**
 * Admin Settings Feature View
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import type { FeatureContext } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Renders administration and settings panel into #adminPage.
 */
export function renderAdminView(context: FeatureContext): void {
  const state = context.getState();
  if (state.role !== 'admin') return;

  const page = $('adminPage');
  if (!page) return;

  const pinDisplay = state.pinRevealed
    ? escapeHtml(state.teacherPin || '------')
    : state.teacherPin
      ? '••••••'
      : '------';

  const classRowsHtml = state.lists
    .map((l) => {
      const isEditing = state.adminEditingListId === l.id;
      return `<div class="class-admin-row">
        ${
          isEditing
            ? `<div>
                 <input id="className-${escapeHtml(l.id)}" type="text" class="class-inline-input" value="${escapeHtml(l.name)}" maxlength="120"
                   data-action="rename-input" data-list-id="${escapeHtml(l.id)}">
                 <div class="muted tiny">${l.students.length} öğrenci</div>
               </div>
               <div class="class-admin-actions">
                 <button type="button" class="icon-btn" style="color:var(--text)"
                   data-action="confirm-rename-list" data-list-id="${escapeHtml(l.id)}" aria-label="Kaydet" title="Kaydet">
                   <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
                 </button>
                 <button type="button" class="icon-btn" data-action="cancel-rename-list" aria-label="İptal" title="İptal">
                   <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
                 </button>
               </div>`
            : `<div><strong>${escapeHtml(l.name)}</strong><div class="muted tiny">${l.students.length} öğrenci</div></div>
               <div class="class-admin-actions">
                 <button type="button" class="icon-btn" data-action="start-rename-list" data-list-id="${escapeHtml(l.id)}"
                   aria-label="Sınıf adını değiştir" title="Ad değiştir">
                   <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>
                 </button>
                 <button type="button" class="icon-btn danger" data-action="delete-list" data-list-id="${escapeHtml(l.id)}"
                   aria-label="Sınıfı sil" title="Sil">
                   <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v6M14 10v6"/></svg>
                 </button>
               </div>`
        }
      </div>`;
    })
    .join('');

  page.innerHTML = `<div class="stack">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <button type="button" class="top-icon-btn" data-action="switch-tab" data-tab="lists" title="Geri">
        <svg viewBox="0 0 24 24"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <h1 class="page-title" style="margin:0">YÖNETİM & AYARLAR</h1>
    </div>

    <section class="plain-section stack">
      <div>
        <h2>Bugünün Hoca PIN'i</h2>
        <div class="pin-row">
          <div class="pin">${pinDisplay}</div>
          <div class="pin-actions">
            <button type="button" class="icon-btn" data-action="toggle-pin-reveal" aria-label="PIN göster/gizle" title="${state.pinRevealed ? 'Gizle' : 'Göster'}">
              <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
            </button>
            <button type="button" class="icon-btn" data-action="copy-pin" aria-label="PIN'i kopyala" title="Kopyala">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button type="button" class="icon-btn" data-action="regenerate-pin" aria-label="Yeni PIN üret" title="Yenile">
              <svg viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M5.5 9a7 7 0 0 1 11.8-2.5L20 9"/><path d="M4 15l2.7 2.5A7 7 0 0 0 18.5 15"/></svg>
            </button>
          </div>
        </div>
        <div class="muted tiny" style="margin-top:4px">${escapeHtml(state.teacherPinDate || '')}</div>
        <div class="muted tiny" style="margin-top:6px">Hoca bu PIN'i haftanın ilk girişinde bir kez kullanır. Cihaz yetkisi Pazartesi 00:00'da otomatik sıfırlanır.</div>
      </div>
    </section>

    <details class="admin-drop" ${state.adminEditingListId ? 'open' : ''}>
      <summary>Sınıf Yönetimi</summary>
      <div class="drop-body">${classRowsHtml}</div>
    </details>

    <details class="admin-drop">
      <summary>Üst Yetkili Parolası</summary>
      <div class="drop-body stack">
        <div class="muted tiny">En az 11 karakter · 1 büyük harf · 1 özel karakter</div>
        <div class="password-wrap">
          <input id="oldAdminPassword" type="password" maxlength="64" autocomplete="current-password" placeholder="Mevcut parola">
          <button type="button" class="password-eye" data-action="reveal-password" data-target="oldAdminPassword" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <div class="password-wrap">
          <input id="newAdminPassword" type="password" maxlength="64" autocomplete="new-password" placeholder="Yeni parola">
          <button type="button" class="password-eye" data-action="reveal-password" data-target="newAdminPassword" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <div class="password-wrap">
          <input id="confirmAdminPassword" type="password" maxlength="64" autocomplete="new-password" placeholder="Yeni parola tekrar">
          <button type="button" class="password-eye" data-action="reveal-password" data-target="confirmAdminPassword" aria-label="Parolayı göster" title="1 saniye göster">
            <svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </button>
        </div>
        <button type="button" class="btn" data-action="change-admin-password">Parolayı değiştir</button>
      </div>
    </details>

    <div style="margin-top:16px;text-align:center">
      <button type="button" class="archive-toggle" data-action="download-backup">Verileri yedekle (.json)</button>
    </div>
  </div>`;
}
