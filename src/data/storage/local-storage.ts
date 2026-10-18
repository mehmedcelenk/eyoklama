/**
 * Strongly-Typed Local and Session Storage Helpers
 * Vibecoding-Safe Native DOM Architecture
 */

import { STORAGE_KEYS, SESSION_KEYS } from './keys';
import { todayKey } from '@shared/date';
import type { AttendanceSession } from '../models/types';

export interface RememberedTeacher {
  name: string;
  until: string;
  valid: boolean;
}

export interface LoginAttemptsRecord {
  count?: number;
  blockedUntil?: number;
}

/**
 * Retrieves the stored teacher name from localStorage.
 */
export function getStoredTeacher(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEYS.TEACHER_NAME) || null;
}

/**
 * Retrieves the stored teacher session expiration timestamp (milliseconds).
 */
export function getStoredTeacherWeekUntil(): number | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL);
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Returns remembered teacher state and validity check.
 */
export function getRememberedTeacher(): RememberedTeacher {
  if (typeof localStorage === 'undefined') {
    return { name: '', until: '', valid: false };
  }
  const name = localStorage.getItem(STORAGE_KEYS.TEACHER_NAME) || '';
  const until = localStorage.getItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL) || '';
  const valid =
    Boolean(name) &&
    Boolean(until) &&
    !Number.isNaN(new Date(until).getTime()) &&
    new Date(until).getTime() > Date.now();

  return { name, until, valid };
}

/**
 * Stores remembered teacher session details.
 */
export function saveTeacherSession(name: string, weekUntil: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.TEACHER_NAME, name);
  localStorage.setItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL, weekUntil);
}

/**
 * Clears remembered teacher credentials from localStorage.
 */
export function clearTeacherSession(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.TEACHER_NAME);
  localStorage.removeItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL);
}

/**
 * Retrieves today's pre-permission statuses mapping (studentKey -> status).
 */
export function getStoredTodayPermissions(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.TODAY_PERMISSIONS) || '{}');
    return raw[todayKey()] || {};
  } catch {
    return {};
  }
}

/**
 * Saves today's pre-permission statuses mapping.
 */
export function saveStoredTodayPermissions(permMap: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = { [todayKey()]: permMap };
    localStorage.setItem(STORAGE_KEYS.TODAY_PERMISSIONS, JSON.stringify(raw));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Retrieves rate-limiting attempts state from localStorage.
 */
export function getLoginAttempts(): LoginAttemptsRecord {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGIN_ATTEMPTS) || '{}');
  } catch {
    return {};
  }
}

/**
 * Saves rate-limiting attempts state to localStorage.
 */
export function saveLoginAttempts(record: LoginAttemptsRecord): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clears rate-limiting login attempts.
 */
export function clearLoginAttempts(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEYS.LOGIN_ATTEMPTS);
  } catch {
    // Ignore
  }
}

/**
 * Retrieves current active in-progress attendance session from sessionStorage.
 */
export function getActiveAttendanceSession(): AttendanceSession | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEYS.ACTIVE_ATTENDANCE) || 'null');
  } catch {
    return null;
  }
}

/**
 * Saves active in-progress attendance session to sessionStorage.
 */
export function saveActiveAttendanceSession(session: AttendanceSession): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEYS.ACTIVE_ATTENDANCE, JSON.stringify(session));
  } catch {
    // Ignore
  }
}

/**
 * Clears active attendance session from sessionStorage.
 */
export function clearActiveAttendanceSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(SESSION_KEYS.ACTIVE_ATTENDANCE);
  } catch {
    // Ignore
  }
}
