/**
 * Storage Key Constants & Multi-Tenant Key Scoping
 * Vibecoding-Safe Native DOM Architecture
 */

import { getActiveInstitution } from '../supabase/config';

export const BASE_STORAGE_KEYS = {
  DEVICE: 'eyoklama_v3_device',
  TEACHER_NAME: 'eyoklama_v3_teacher_name',
  TEACHER_WEEK_UNTIL: 'eyoklama_v3_teacher_week_until',
  TEACHER_TC: 'eyoklama_v3_teacher_tc',
  LAST_INSTITUTION_SLUG: 'eyoklama_v3_last_inst_slug',
  LOGIN_ATTEMPTS: 'eyoklama_login_attempts',
  TODAY_PERMISSIONS: 'eyoklama_v3_today_permissions'
} as const;

/**
 * Scopes storage key by active institution slug so multiple institutions
 * don't overwrite each other's sessions on the same device.
 */
export function getScopedKey(baseKey: string): string {
  const inst = getActiveInstitution();
  if (!inst || inst.slug === 'default') {
    return baseKey;
  }
  return `${baseKey}_${inst.slug}`;
}

export function getTeacherNameKey(): string {
  return getScopedKey(BASE_STORAGE_KEYS.TEACHER_NAME);
}

export function getTeacherWeekUntilKey(): string {
  return getScopedKey(BASE_STORAGE_KEYS.TEACHER_WEEK_UNTIL);
}

export function getTeacherTcKey(): string {
  return getScopedKey(BASE_STORAGE_KEYS.TEACHER_TC);
}

export function getLastInstitutionSlugKey(): string {
  return BASE_STORAGE_KEYS.LAST_INSTITUTION_SLUG;
}

export function getTodayPermissionsKey(): string {
  return getScopedKey(BASE_STORAGE_KEYS.TODAY_PERMISSIONS);
}

export function getActiveAttendanceKey(): string {
  return getScopedKey('eyoklama_active');
}

export const STORAGE_KEYS = BASE_STORAGE_KEYS;
export const TEACHER_NAME_KEY = BASE_STORAGE_KEYS.TEACHER_NAME;
export const TEACHER_WEEK_UNTIL_KEY = BASE_STORAGE_KEYS.TEACHER_WEEK_UNTIL;
export const DEVICE_KEY = BASE_STORAGE_KEYS.DEVICE;
export const LOGIN_ATTEMPTS_KEY = BASE_STORAGE_KEYS.LOGIN_ATTEMPTS;
export const TODAY_PERMISSIONS_KEY = BASE_STORAGE_KEYS.TODAY_PERMISSIONS;

export const SESSION_KEYS = {
  ACTIVE_ATTENDANCE: 'eyoklama_active',
  LEGACY_SESSION: 'eyoklama_v2_session'
} as const;
