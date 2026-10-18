/**
 * Storage Key Constants
 * Vibecoding-Safe Native DOM Architecture
 */

export const STORAGE_KEYS = {
  DEVICE: 'eyoklama_v3_device',
  TEACHER_NAME: 'eyoklama_v3_teacher_name',
  TEACHER_WEEK_UNTIL: 'eyoklama_v3_teacher_week_until',
  LOGIN_ATTEMPTS: 'eyoklama_login_attempts',
  TODAY_PERMISSIONS: 'eyoklama_v3_today_permissions'
} as const;

export const TEACHER_NAME_KEY = STORAGE_KEYS.TEACHER_NAME;
export const TEACHER_WEEK_UNTIL_KEY = STORAGE_KEYS.TEACHER_WEEK_UNTIL;
export const DEVICE_KEY = STORAGE_KEYS.DEVICE;
export const LOGIN_ATTEMPTS_KEY = STORAGE_KEYS.LOGIN_ATTEMPTS;
export const TODAY_PERMISSIONS_KEY = STORAGE_KEYS.TODAY_PERMISSIONS;

export const SESSION_KEYS = {
  ACTIVE_ATTENDANCE: 'eyoklama_active',
  LEGACY_SESSION: 'eyoklama_v2_session'
} as const;

