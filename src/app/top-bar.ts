/**
 * Top Navigation Bar Controller
 * Vibecoding-Safe Native DOM Architecture
 * Manages branding, responsive title resolution, badges, and top-bar navigation actions
 */

import type { AppState, FeatureContext, TabName } from '../data/models/types';
import { getActiveInstitution } from '../data/supabase/config';
import { getTodayPermissions, startPrePermissionView } from '../features/pre-permissions/pre-permissions-view';
import { logout } from '../features/auth/auth-view';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Returns human-readable page title according to active tab and state.
 */
export function getPageTitle(tab: TabName, state: AppState): string {
  switch (tab) {
    case 'lists':
      return state.session.institutionName || getActiveInstitution().brandTitle;
    case 'admin':
      return 'Ayarlar';
    case 'grades':
      return 'Not & Kanaat';
    case 'new':
      return 'Sınıf / Ders Ekle';
    case 'history':
      return 'Geçmiş Yoklamalar';
    case 'attendance':
      return state.attendance.active?.listName || 'Yoklama';
    default:
      return state.session.institutionName || getActiveInstitution().brandTitle;
  }
}

/**
 * Updates top navigation bar badges, brand/page title, and conditional buttons.
 * When on the home page ('lists'), shows the logo and institution name.
 * When on any inner page, hides the logo and displays the current page title.
 */
export function updateTopBar(context: FeatureContext): void {
  if (typeof document === 'undefined') return;

  const state = context.getState();
  const currentTab = state.navigation.currentTab;
  const isHome = currentTab === 'lists';

  const todayPerms = getTodayPermissions();
  const permCount = Object.keys(todayPerms).length;
  const badgeEl = $('topPermBadge');

  if (badgeEl) {
    badgeEl.textContent = String(permCount);
    badgeEl.classList.toggle('hidden', permCount === 0);
  }

  // topAdminBtn is available to both teachers and admins
  $('topAdminBtn')?.classList.remove('hidden');

  // Toggle brand logo vs back arrow icon and page title
  const logoEl = $('topBrandLogo') || document.querySelector('#topBrandBtn .login-mark');
  if (logoEl) {
    logoEl.classList.toggle('hidden', !isHome);
  }

  const backBtnEl = $('topBackBtn') || $('topBrandBackIcon');
  if (backBtnEl) {
    backBtnEl.classList.toggle('hidden', isHome);
  }

  const brandTitleEl = document.querySelector('.brand-title');
  if (brandTitleEl) {
    brandTitleEl.textContent = getPageTitle(currentTab, state);
  }

  const topBrandBtn = $('topBrandBtn');
  if (topBrandBtn) {
    topBrandBtn.setAttribute('title', isHome ? 'Ana Sayfa' : 'Ana Sayfaya Dön');
  }

  // Hide global action icons on inner pages (settings, class editing, grades)
  // so the top bar matches the clean inner-page type of attendance and permissions
  const navActionsEl = $('topNavActions') || document.querySelector('.top-nav-actions');
  if (navActionsEl) {
    navActionsEl.classList.toggle('hidden', !isHome);
  }
}

/**
 * Attaches event listeners for top navigation bar buttons.
 */
export function initTopBarEvents(context: FeatureContext): void {
  if (typeof document === 'undefined') return;

  $('topBrandBtn')?.addEventListener('click', () => context.navigate('lists'));
  $('topBackBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    context.navigate('lists');
  });
  $('topPermBtn')?.addEventListener('click', () => startPrePermissionView(context));
  $('topGradesBtn')?.addEventListener('click', () => context.navigate('grades'));
  $('topAdminBtn')?.addEventListener('click', () => context.navigate('admin'));
  $('topLogoutBtn')?.addEventListener('click', () => logout(context));
}
