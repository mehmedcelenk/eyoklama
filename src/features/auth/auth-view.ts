/**
 * Authentication Feature View & Controller
 * Vibecoding-Safe Native DOM Architecture
 * Handles 3-Tab Login Mode (Teacher / Parent / Institution Admin)
 */

import { rpc } from '../../data/supabase/rpc';
import { getDeviceToken } from '../../data/auth/device';
import {
  getTeacherNameKey,
  getTeacherWeekUntilKey,
  getLastInstitutionSlugKey
} from '../../data/storage/keys';
import {
  getActiveInstitution,
  getActiveInstitutionSlug,
  setActiveInstitution
} from '../../data/supabase/config';
import type { FeatureContext, LoginResult } from '../../data/models/types';
import { toast } from '../../shared/toast';
import {
  getLoginRateLimitMsg,
  recordFailedAttempt,
  resetLoginAttempts
} from './rate-limit';
import { initTeacherInputs, stopApprovalPolling } from './teacher-auth';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export type LoginTabMode = 'teacher' | 'parent' | 'admin';

/**
 * Checks for remembered teacher in localStorage within 7-day validity.
 */
export function rememberedTeacher(): { name: string; until: string; valid: boolean } {
  if (typeof localStorage === 'undefined') {
    return { name: '', until: '', valid: false };
  }
  const name = localStorage.getItem(getTeacherNameKey()) || '';
  const until = localStorage.getItem(getTeacherWeekUntilKey()) || '';
  const valid =
    Boolean(name) &&
    Boolean(until) &&
    !Number.isNaN(new Date(until).getTime()) &&
    new Date(until).getTime() > Date.now();
  return { name, until, valid };
}

/**
 * Displays error or status notices in login form (supports both legacy and new notice IDs).
 */
export function loginMsg(msg: string, type: 'error' | 'success' = 'error'): void {
  const e = $('adminLoginMsg') || $('teacherLoginMsg') || $('loginMessage');
  if (!e) return;
  e.textContent = msg;
  e.className = `notice ${type}`;
  e.classList.remove('hidden');
}

/**
 * Temporarily reveals masked password input for 1 second.
 */
export function revealPassword(id: string): void {
  const el = $(id) as HTMLInputElement | null;
  if (!el) return;
  const target = el as unknown as { _hideTimer?: ReturnType<typeof setTimeout> };
  if (target._hideTimer) {
    clearTimeout(target._hideTimer);
  }
  el.type = 'text';
  target._hideTimer = setTimeout(() => {
    el.type = 'password';
  }, 1000);
}

/**
 * Switches between the 3 login tabs: 'teacher' | 'parent' | 'admin'
 */
export function switchLoginTab(tab: LoginTabMode): void {
  stopApprovalPolling();
  const teacherBtn = $('teacherLoginTabBtn');
  const parentBtn = $('parentQueryTabBtn');
  const adminBtn = $('adminLoginTabBtn');

  const teacherSec = $('teacherLoginSection');
  const parentSec = $('parentQuerySection');
  const adminSec = $('adminLoginSection');

  teacherBtn?.classList.toggle('active', tab === 'teacher');
  parentBtn?.classList.toggle('active', tab === 'parent');
  adminBtn?.classList.toggle('active', tab === 'admin');

  teacherSec?.classList.toggle('hidden', tab !== 'teacher');
  parentSec?.classList.toggle('hidden', tab !== 'parent');
  adminSec?.classList.toggle('hidden', tab !== 'admin');

  $('teacherLoginMsg')?.classList.add('hidden');
  $('adminLoginMsg')?.classList.add('hidden');
}

/**
 * Renders initial login view and pre-populates saved institution/teacher fields.
 */
export function renderLoginMode(_forceCredentials = false): void {
  const activeInst = getActiveInstitution();
  const subtitle = $('loginSubtitle');
  if (subtitle) {
    subtitle.textContent = activeInst.slug !== 'default'
      ? `${activeInst.name} · Yoklama Sistemi`
      : 'Yoklama. Gerektiği kadar.';
  }

  initTeacherInputs();

  if (typeof localStorage !== 'undefined') {
    const savedSlug = localStorage.getItem(getLastInstitutionSlugKey());
    if (savedSlug) {
      const parentInst = $('parentInstCode') as HTMLInputElement | null;
      const adminInst = $('adminInstCode') as HTMLInputElement | null;
      if (parentInst && !parentInst.value) parentInst.value = savedSlug;
      if (adminInst && !adminInst.value) adminInst.value = savedSlug;
    }
  }
}

/**
 * Stores token, role, and teacher session upon successful login.
 */
export function setSession(result: LoginResult, context: FeatureContext): void {
  context.setState((prev) => ({
    session: {
      ...prev.session,
      token: result.token,
      role: result.role,
      displayName: result.displayName,
      institutionId: result.institutionId,
      institutionSlug: result.institutionSlug,
      institutionName: result.institutionName
    }
  }));

  if (result.role === 'teacher' && typeof localStorage !== 'undefined') {
    localStorage.setItem(getTeacherNameKey(), result.displayName || '');
    localStorage.setItem(
      getTeacherWeekUntilKey(),
      result.teacherWeekEndsAt || result.expiresAt || ''
    );
  }
}

/**
 * Handles Institution Administrator login submission (Tab 3: Kurum Girişi).
 */
export async function handleAdminLogin(context: FeatureContext): Promise<void> {
  const limit = getLoginRateLimitMsg();
  if (limit) {
    loginMsg(limit);
    return;
  }

  const btn = $('adminSubmitBtn') as HTMLButtonElement | null;
  const instInput = $('adminInstCode') as HTMLInputElement | null;
  const passInput = $('adminPasswordInput') as HTMLInputElement | null;
  const msgEl = $('adminLoginMsg');

  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Giriş yapılıyor…';
    }
    msgEl?.classList.add('hidden');

    const instSlug = (instInput?.value.trim() || getActiveInstitutionSlug() || 'default').toLowerCase();
    const password = passInput?.value.trim() || '';

    if (!password) {
      throw new Error('Yönetici şifresini yazın.');
    }

    setActiveInstitution(instSlug);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getLastInstitutionSlugKey(), instSlug);
    }

    const deviceToken = getDeviceToken();
    const r = (await rpc('app_login', {
      p_name: 'admin',
      p_pin: password,
      p_device_token: deviceToken,
      p_institution_slug: instSlug
    })) as LoginResult & { ok?: boolean; error?: string };

    if (!r?.ok) {
      recordFailedAttempt();
      throw new Error(r?.error || 'Yönetici şifresi hatalı.');
    }

    resetLoginAttempts();
    setSession(r, context);
    await context.refresh();
  } catch (e: unknown) {
    const l = getLoginRateLimitMsg();
    const err = e as { message?: string };
    if (msgEl) {
      msgEl.textContent = l || err.message || 'Giriş başarısız.';
      msgEl.className = 'notice error';
      msgEl.classList.remove('hidden');
    } else {
      loginMsg(l || err.message || 'Giriş başarısız.');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Yönetici Girişi Yap';
    }
  }
}

// Backward-compatible aliases for tests & shims
export async function handleLogin(context: FeatureContext): Promise<void> {
  return handleAdminLogin(context);
}

export async function handleContinueTeacher(_context: FeatureContext): Promise<void> {
  // Handled automatically by teacher-auth.ts
}

export function handleDifferentTeacher(): void {
  stopApprovalPolling();
  renderLoginMode(true);
}

/**
 * User logout workflow: prompts confirmation, releases attendance lock,
 * calls app_logout RPC, purges tokens and session data, and resets views.
 */
export async function logout(context: FeatureContext): Promise<void> {
  if (typeof window !== 'undefined' && !window.confirm('Çıkış yapılsın mı?')) {
    return;
  }
  stopApprovalPolling();
  const state = context.getState();
  try {
    if (state.session.token && state.attendance.active?.listId) {
      await rpc('release_attendance', {
        p_token: state.session.token,
        p_list_id: state.attendance.active.listId
      });
    }
  } catch {
    // ignore release errors
  }
  try {
    if (state.session.token) {
      await rpc('app_logout', { p_token: state.session.token });
    }
  } catch {
    // ignore logout errors
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('eyoklama_active');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getTeacherWeekUntilKey());
  }

  context.setState({
    session: {
      token: '',
      role: null,
      displayName: '',
      teacherPin: null,
      teacherPinDate: null,
      pinRevealed: false
    },
    attendance: {
      active: null,
      isSaving: false
    },
    history: {
      sessionDetailsCache: {}
    }
  });

  if (typeof document !== 'undefined') {
    $('appView')?.classList.add('hidden');
    $('loginView')?.classList.remove('hidden');
    const passInput = $('adminPasswordInput') as HTMLInputElement | null;
    if (passInput) passInput.value = '';
    renderLoginMode(true);
  }
  toast('Çıkış yapıldı.');
}
