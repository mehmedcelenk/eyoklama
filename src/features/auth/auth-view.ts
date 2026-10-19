/**
 * Authentication Feature View & Controller
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - strictly under 350 lines
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
import {
  getLoginRateLimitMsg,
  recordFailedAttempt,
  resetLoginAttempts
} from './rate-limit';
import { initTeacherInputs, stopApprovalPolling } from './teacher-auth';
import {
  rememberedTeacher,
  loginMsg,
  revealPassword,
  setSession
} from './session';
import { logout } from './logout';

export { rememberedTeacher, loginMsg, revealPassword, setSession, logout };

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export type LoginTabMode = 'teacher' | 'parent' | 'admin';

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
export function renderLoginMode(forceCredentials = false): void {
  const activeInst = getActiveInstitution();
  const subtitle = $('loginSubtitle');
  if (subtitle) {
    subtitle.textContent = activeInst.slug !== 'default'
      ? `${activeInst.name} · Yoklama Sistemi`
      : 'Yoklama. Gerektiği kadar.';
  }

  initTeacherInputs();

  const remembered = rememberedTeacher();
  const continueBox = $('continueLogin');
  const credentials = $('teacherInputGroup') || $('credentialLogin');
  const msg = $('teacherLoginMsg') || $('loginMessage');

  if (remembered.valid && !forceCredentials) {
    const continueBtn = $('continueTeacherBtn');
    if (continueBtn) {
      continueBtn.textContent = `${remembered.name} olarak devam et`;
    }
    continueBox?.classList.remove('hidden');
    credentials?.classList.add('hidden');
  } else {
    continueBox?.classList.add('hidden');
    credentials?.classList.remove('hidden');
    const nameInput = ($('teacherFullName') || $('loginName')) as HTMLInputElement | null;
    if (remembered.name && nameInput && !nameInput.value) {
      nameInput.value = remembered.name;
    }
  }
  if (msg) msg.classList.add('hidden');

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
      p_device_token: deviceToken
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

/**
 * Handles explicit teacher / admin PIN credential login submission.
 */
export async function handleLogin(context: FeatureContext): Promise<void> {
  const limit = getLoginRateLimitMsg();
  if (limit) {
    loginMsg(limit);
    return;
  }
  const btn = ($('teacherSubmitBtn') || $('loginBtn')) as HTMLButtonElement | null;
  const nameInput = ($('teacherFullName') || $('loginName')) as HTMLInputElement | null;
  const pinInput = ($('teacherPin') || $('loginPin')) as HTMLInputElement | null;

  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Giriş yapılıyor…';
    }
    const name = nameInput?.value.trim() || '';
    const pin = pinInput?.value.trim() || '';
    if (!name) throw new Error('Hoca adını yazın.');
    if (!pin) throw new Error('PIN / parolayı yazın.');

    const deviceToken = getDeviceToken();
    const r = (await rpc('app_login', {
      p_name: name,
      p_pin: pin,
      p_device_token: deviceToken
    })) as LoginResult & { ok?: boolean; error?: string };

    if (!r?.ok) {
      recordFailedAttempt();
      throw new Error(r?.error || 'PIN veya şifre hatalı.');
    }
    resetLoginAttempts();
    setSession(r, context);
    await context.refresh();
  } catch (e: unknown) {
    const l = getLoginRateLimitMsg();
    const err = e as { message?: string };
    loginMsg(l || err.message || 'Giriş başarısız.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Giriş Yap';
    }
  }
}

/**
 * Handles 1-click continuation for remembered weekly teacher session.
 */
export async function handleContinueTeacher(context: FeatureContext): Promise<void> {
  const limit = getLoginRateLimitMsg();
  if (limit) {
    loginMsg(limit);
    return;
  }
  const btn = $('continueTeacherBtn') as HTMLButtonElement | null;
  const remembered = rememberedTeacher();

  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Giriş yapılıyor…';
    }
    const deviceToken = getDeviceToken();
    const r = (await rpc('app_login', {
      p_name: '',
      p_pin: '',
      p_device_token: deviceToken
    })) as LoginResult & { ok?: boolean; code?: string; error?: string };

    if (!r?.ok) {
      recordFailedAttempt();
      if (r?.code === 'WEEKLY_PIN_REQUIRED') {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(getTeacherWeekUntilKey());
        }
        renderLoginMode(true);
        const nameInput = ($('teacherFullName') || $('loginName')) as HTMLInputElement | null;
        if (nameInput) nameInput.value = remembered.name || '';
        const pinInput = ($('teacherPin') || $('loginPin')) as HTMLInputElement | null;
        pinInput?.focus();
        loginMsg(r.error || 'Bu haftanın ilk girişinde PIN gerekli.');
        return;
      }
      throw new Error(r?.error || 'Giriş başarısız.');
    }
    resetLoginAttempts();
    setSession(r, context);
    await context.refresh();
  } catch (e: unknown) {
    renderLoginMode(true);
    const nameInput = ($('teacherFullName') || $('loginName')) as HTMLInputElement | null;
    if (nameInput) nameInput.value = remembered.name || '';
    const l = getLoginRateLimitMsg();
    const err = e as { message?: string };
    loginMsg(l || err.message || 'Giriş başarısız.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('loading');
      const nowRemembered = rememberedTeacher();
      btn.textContent = nowRemembered.name
        ? `${nowRemembered.name} olarak devam et`
        : 'Hoca olarak devam et';
    }
  }
}

export function handleDifferentTeacher(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getTeacherNameKey());
    localStorage.removeItem(getTeacherWeekUntilKey());
  }
  stopApprovalPolling();
  renderLoginMode(true);
  const nameInput = ($('teacherFullName') || $('loginName')) as HTMLInputElement | null;
  const pinInput = ($('teacherPin') || $('loginPin')) as HTMLInputElement | null;
  if (nameInput) nameInput.value = '';
  if (pinInput) pinInput.value = '';
  nameInput?.focus();
}
