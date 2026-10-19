/**
 * Authentication Session & UI Helper Utilities
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - strictly under 350 lines
 */

import {
  getTeacherNameKey,
  getTeacherWeekUntilKey
} from '../../data/storage/keys';
import type { FeatureContext, LoginResult } from '../../data/models/types';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

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
