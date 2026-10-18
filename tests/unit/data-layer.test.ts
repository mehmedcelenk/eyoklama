import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEYS,
  SESSION_KEYS,
  getStoredTeacher,
  saveTeacherSession,
  clearTeacherSession,
  getRememberedTeacher,
  getStoredTodayPermissions,
  saveStoredTodayPermissions,
  getLoginAttempts,
  saveLoginAttempts,
  clearLoginAttempts,
  getActiveAttendanceSession,
  saveActiveAttendanceSession,
  clearActiveAttendanceSession,
  getDeviceToken,
  cleanRpcError,
  SUPABASE_URL,
  SUPABASE_KEY,
  getSupabaseClient
} from '@data/index';

describe('Data Layer & Storage Contracts', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('defines correct storage key constants', () => {
    expect(STORAGE_KEYS.DEVICE).toBe('eyoklama_v3_device');
    expect(STORAGE_KEYS.TEACHER_NAME).toBe('eyoklama_v3_teacher_name');
    expect(STORAGE_KEYS.TEACHER_WEEK_UNTIL).toBe('eyoklama_v3_teacher_week_until');
    expect(STORAGE_KEYS.LOGIN_ATTEMPTS).toBe('eyoklama_login_attempts');
    expect(STORAGE_KEYS.TODAY_PERMISSIONS).toBe('eyoklama_v3_today_permissions');
    expect(SESSION_KEYS.ACTIVE_ATTENDANCE).toBe('eyoklama_active');
    expect(SESSION_KEYS.LEGACY_SESSION).toBe('eyoklama_v2_session');
  });

  it('manages teacher session storage getters, setters, and clearers', () => {
    expect(getStoredTeacher()).toBeNull();

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    saveTeacherSession('Ayşe Hoca', futureDate);

    expect(getStoredTeacher()).toBe('Ayşe Hoca');
    const remembered = getRememberedTeacher();
    expect(remembered.name).toBe('Ayşe Hoca');
    expect(remembered.valid).toBe(true);

    clearTeacherSession();
    expect(getStoredTeacher()).toBeNull();
    expect(getRememberedTeacher().valid).toBe(false);
  });

  it('persists and retrieves today permissions mapping', () => {
    expect(getStoredTodayPermissions()).toEqual({});

    const perms = { 'student-1': 'excused', 'student-2': 'absent' };
    saveStoredTodayPermissions(perms);

    expect(getStoredTodayPermissions()).toEqual(perms);
  });

  it('handles rate-limiting login attempts counter and clear', () => {
    expect(getLoginAttempts()).toEqual({});

    saveLoginAttempts({ count: 2, blockedUntil: 123456789 });
    expect(getLoginAttempts()).toEqual({ count: 2, blockedUntil: 123456789 });

    clearLoginAttempts();
    expect(getLoginAttempts()).toEqual({});
  });

  it('manages active attendance session in sessionStorage', () => {
    expect(getActiveAttendanceSession()).toBeNull();

    const session = {
      listId: 'list-1',
      listName: '9-A',
      statuses: { s1: 'present' as const }
    };
    saveActiveAttendanceSession(session);
    expect(getActiveAttendanceSession()).toEqual(session);

    clearActiveAttendanceSession();
    expect(getActiveAttendanceSession()).toBeNull();
  });

  it('generates a 64-character hexadecimal device token and persists it', () => {
    const token = getDeviceToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // Subsequent retrieval should return the exact same token
    const token2 = getDeviceToken();
    expect(token2).toBe(token);
  });

  it('cleans RPC error strings from Postgres error wrappers', () => {
    expect(cleanRpcError({ message: 'P0001: Geçersiz PIN girildi.' })).toBe('Geçersiz PIN girildi.');
    expect(cleanRpcError({ message: 'message: Başka bir işlem devam ediyor.' })).toBe('Başka bir işlem devam ediyor.');
    expect(cleanRpcError(null)).toBe('İşlem başarısız.');
  });

  it('initializes Supabase client singleton with correct configuration', () => {
    expect(SUPABASE_URL).toContain('supabase.co');
    expect(SUPABASE_KEY).toBeTruthy();

    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.rpc).toBe('function');
  });
});
