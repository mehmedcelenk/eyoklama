/**
 * Admin Settings Feature View
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import type { FeatureContext } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import {
  renderPoolManagementHtml,
  setupPoolManagementListeners,
  setPoolAddingMode,
  setPoolEditingMode
} from './pool-management';
import {
  renderTeacherManagementHtml,
  setupTeacherManagementListeners
} from './teacher-management';
import {
  renderClassManagementHtml,
  setupClassManagementListeners
} from './class-management';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

let activeSettingsTab: 'classes' | 'pool' | 'teachers' | 'institution' = 'classes';

export function getActiveSettingsTab(): 'classes' | 'pool' | 'teachers' | 'institution' {
  return activeSettingsTab;
}

export function setActiveSettingsTab(tab: 'classes' | 'pool' | 'teachers' | 'institution'): void {
  activeSettingsTab = tab;
  if (tab !== 'pool') {
    setPoolAddingMode(false);
    setPoolEditingMode(false);
  }
}

/**
 * Renders administration and settings panel into #adminPage.
 */
export function renderAdminView(context: FeatureContext): void {
  const state = context.getState();
  const isAdmin = state.session.role === 'admin';
  const page = $('adminPage');
  if (!page) return;

  // Non-admin teachers can only view 'classes'
  if (!isAdmin && activeSettingsTab !== 'classes') {
    activeSettingsTab = 'classes';
  }

  const classRowsHtml = renderClassManagementHtml(context);

  const tabsHtml = isAdmin
    ? `<div class="mode-toggle" style="margin-bottom:12px;grid-template-columns:repeat(4,1fr)">
        <button type="button" class="${activeSettingsTab === 'classes' ? 'active' : ''}" data-action="switch-settings-tab" data-tab="classes">Sınıflar</button>
        <button type="button" class="${activeSettingsTab === 'pool' ? 'active' : ''}" data-action="switch-settings-tab" data-tab="pool">Havuz</button>
        <button type="button" class="${activeSettingsTab === 'teachers' ? 'active' : ''}" data-action="switch-settings-tab" data-tab="teachers">Hocalar</button>
        <button type="button" class="${activeSettingsTab === 'institution' ? 'active' : ''}" data-action="switch-settings-tab" data-tab="institution">Kurum</button>
      </div>`
    : '';

  let contentHtml = '';

  if (activeSettingsTab === 'classes') {
    contentHtml = `
      <div class="stack">
        <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:6px">
          <button type="button" class="btn small" data-action="switch-tab" data-tab="new" title="Yeni Sınıf Ekle" aria-label="Yeni Sınıf Ekle" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          </button>
        </div>
        <div class="stack" style="gap:6px">${classRowsHtml}</div>
      </div>
    `;
  } else if (activeSettingsTab === 'pool' && isAdmin) {
    contentHtml = renderPoolManagementHtml(context);
  } else if (activeSettingsTab === 'teachers' && isAdmin) {
    contentHtml = renderTeacherManagementHtml(context);
  } else if (activeSettingsTab === 'institution' && isAdmin) {
    contentHtml = `
      <div class="stack">
        <section class="card stack" style="padding:14px;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0;font-size:0.95rem;font-weight:700">Kurum Bilgileri</h3>
            <span class="badge tiny">${escapeHtml(state.session.institutionSlug || 'default')}</span>
          </div>
          <div class="muted tiny">Kurum adı ve giriş kodu hoca, veli ve yönetici girişlerinde kullanılır.</div>
          <label class="stack" style="gap:4px">
            <span class="muted tiny">Kurum Adı:</span>
            <input id="institutionNameInput" type="text" value="${escapeHtml(state.session.institutionName || '1. Kurum')}" placeholder="Örn: Bilfen Koleji" maxlength="100" style="min-height:36px">
          </label>
          <label class="stack" style="gap:4px">
            <span class="muted tiny">Kurum Giriş Kodu (Slug):</span>
            <input id="institutionSlugInput" type="text" value="${escapeHtml(state.session.institutionSlug || 'default')}" placeholder="Örn: bilfen" maxlength="50" style="min-height:36px;font-family:monospace">
          </label>
          <button type="button" class="btn small" data-action="update-institution-profile" style="align-self:flex-start">Kurum Bilgilerini Kaydet</button>
        </section>

        <section class="card stack" style="padding:14px">
          <h3 style="margin:0;font-size:0.95rem">Üst Yetkili Parolası Değiştir</h3>
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
          <button type="button" class="btn small" data-action="change-admin-password" style="align-self:flex-start">Parolayı Değiştir</button>
        </section>

        <div style="margin-top:8px;text-align:center">
          <button type="button" class="btn secondary small" data-action="download-backup">Sistem Verilerini Yedekle (.json)</button>
        </div>
      </div>
    `;
  }

  page.innerHTML = `<div class="stack">
    ${tabsHtml}
    ${contentHtml}
  </div>`;

  if (activeSettingsTab === 'pool' && isAdmin) {
    setupPoolManagementListeners(context, () => renderAdminView(context));
  }
  if (activeSettingsTab === 'teachers' && isAdmin) {
    setupTeacherManagementListeners(context);
  }
  if (activeSettingsTab === 'classes') {
    setupClassManagementListeners(() => renderAdminView(context));
  }
}
