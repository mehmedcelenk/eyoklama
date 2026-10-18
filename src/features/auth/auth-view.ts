/**
 * Authentication Feature View & Controller
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import { getDeviceToken } from '../../data/auth/device';
import { TEACHER_NAME_KEY, TEACHER_WEEK_UNTIL_KEY } from '../../data/storage/keys';
import type { FeatureContext, LoginResult } from '../../data/models/types';
import { toast } from '../../shared/toast';
import {
  getLoginRateLimitMsg,
  recordFailedAttempt,
  resetLoginAttempts
} from './rate-limit';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Checks for remembered teacher in localStorage within 7-day validity.
 */
export function rememberedTeacher(): { name: string; until: string; valid: boolean } {
  if (typeof localStorage === 'undefined') {
    return { name: '', until: '', valid: false };
  }
  const name = localStorage.getItem(TEACHER_NAME_KEY) || '';
  const until = localStorage.getItem(TEACHER_WEEK_UNTIL_KEY) || '';
  const valid =
    Boolean(name) &&
    Boolean(until) &&
    !Number.isNaN(new Date(until).getTime()) &&
    new Date(until).getTime() > Date.now();
  return { name, until, valid };
}

/**
 * Displays error or status notices in login form.
 */
export function loginMsg(msg: string, type: 'error' | 'success' = 'error'): void {
  const e = $('loginMessage');
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
 * Renders remembered teacher mode or manual credential inputs.
 */
export function renderLoginMode(forceCredentials = false): void {
  const remembered = rememberedTeacher();
  const continueBox = $('continueLogin');
  const credentials = $('credentialLogin');
  const msg = $('loginMessage');
  if (!continueBox || !credentials) return;

  if (remembered.valid && !forceCredentials) {
    const continueBtn = $('continueTeacherBtn');
    if (continueBtn) {
      continueBtn.textContent = `${remembered.name} olarak devam et`;
    }
    continueBox.classList.remove('hidden');
    credentials.classList.add('hidden');
  } else {
    continueBox.classList.add('hidden');
    credentials.classList.remove('hidden');
    const nameInput = $('loginName') as HTMLInputElement | null;
    if (remembered.name && nameInput && !nameInput.value) {
      nameInput.value = remembered.name;
    }
  }
  if (msg) msg.classList.add('hidden');
}

/**
 * Stores token, role, and teacher session upon successful login.
 */
export function setSession(result: LoginResult, context: FeatureContext): void {
  context.setState({
    token: result.token,
    role: result.role,
    displayName: result.displayName
  });

  if (result.role === 'teacher' && typeof localStorage !== 'undefined') {
    localStorage.setItem(TEACHER_NAME_KEY, result.displayName || '');
    localStorage.setItem(
      TEACHER_WEEK_UNTIL_KEY,
      result.teacherWeekEndsAt || result.expiresAt || ''
    );
  }
}

/**
 * Handles explicit teacher / admin credential login submission.
 */
export async function handleLogin(context: FeatureContext): Promise<void> {
  const limit = getLoginRateLimitMsg();
  if (limit) {
    loginMsg(limit);
    return;
  }
  const btn = $('loginBtn') as HTMLButtonElement | null;
  const nameInput = $('loginName') as HTMLInputElement | null;
  const pinInput = $('loginPin') as HTMLInputElement | null;

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

    const deviceToken = await getDeviceToken();
    const r = (await rpc('app_login', {
      p_name: name,
      p_pin: pin,
      p_device_token: deviceToken
    })) as LoginResult & { ok?: boolean; error?: string };

    if (!r?.ok) {
      recordFailedAttempt();
      throw new Error(r?.error || 'Giriş başarısız.');
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
      btn.textContent = 'Giriş yap';
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
    const deviceToken = await getDeviceToken();
    const r = (await rpc('app_login', {
      p_name: '',
      p_pin: '',
      p_device_token: deviceToken
    })) as LoginResult & { ok?: boolean; code?: string; error?: string };

    if (!r?.ok) {
      recordFailedAttempt();
      if (r?.code === 'WEEKLY_PIN_REQUIRED') {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(TEACHER_WEEK_UNTIL_KEY);
        }
        renderLoginMode(true);
        const nameInput = $('loginName') as HTMLInputElement | null;
        if (nameInput) nameInput.value = remembered.name || '';
        const pinInput = $('loginPin') as HTMLInputElement | null;
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
    const nameInput = $('loginName') as HTMLInputElement | null;
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

/**
 * Switches from remembered teacher button to explicit credential inputs.
 */
export function handleDifferentTeacher(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TEACHER_NAME_KEY);
    localStorage.removeItem(TEACHER_WEEK_UNTIL_KEY);
  }
  renderLoginMode(true);
  const nameInput = $('loginName') as HTMLInputElement | null;
  const pinInput = $('loginPin') as HTMLInputElement | null;
  if (nameInput) nameInput.value = '';
  if (pinInput) pinInput.value = '';
  nameInput?.focus();
}

/**
 * User logout workflow: prompts confirmation, releases attendance lock,
 * calls app_logout RPC, purges tokens and session data, and resets views.
 */
export async function logout(context: FeatureContext): Promise<void> {
  if (typeof window !== 'undefined' && !window.confirm('Çıkış yapılsın mı?')) {
    return;
  }
  const state = context.getState();
  try {
    if (state.token && state.active?.listId) {
      await rpc('release_attendance', {
        p_token: state.token,
        p_list_id: state.active.listId
      });
    }
  } catch {
    // ignore release errors
  }
  try {
    if (state.token) {
      await rpc('app_logout', { p_token: state.token });
    }
  } catch {
    // ignore logout errors
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('eyoklama_active');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TEACHER_NAME_KEY);
    localStorage.removeItem(TEACHER_WEEK_UNTIL_KEY);
  }

  context.setState({
    token: '',
    role: null,
    displayName: '',
    active: null,
    attendanceCache: {}
  });

  if (typeof document !== 'undefined') {
    $('appView')?.classList.add('hidden');
    $('loginView')?.classList.remove('hidden');
    const nameInput = $('loginName') as HTMLInputElement | null;
    const pinInput = $('loginPin') as HTMLInputElement | null;
    if (nameInput) nameInput.value = '';
    if (pinInput) pinInput.value = '';
    renderLoginMode(true);
  }
  toast('Çıkış yapıldı.');
}
