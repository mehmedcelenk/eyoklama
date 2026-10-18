/**
 * Data Layer Empirical Stress Test Suite
 * Adversarially challenges:
 * 1. Storage robustness: corrupted JSON, null, storage quota exceeded, date deserialization
 * 2. Device token format: 64-char hex format, uniqueness across iterations, self-healing, fallback
 * 3. Supabase RPC client: cleanRpcError parsing, simulated network errors, timeouts, offline detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STORAGE_KEYS,
  SESSION_KEYS,
  getStoredTeacher,
  getStoredTeacherWeekUntil,
  getRememberedTeacher,
  saveTeacherSession,
  clearTeacherSession,
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
  rpc,
  getSupabaseClient,
  setSupabaseClient,
  type RpcFunctionName
} from '@data/index';

describe('Empirical Challenge: LocalStorage Robustness & Edge Cases', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Corrupted JSON Handling', () => {
    it('handles truncated or invalid JSON in TODAY_PERMISSIONS gracefully', () => {
      const corruptedPayloads = [
        '{',
        '{"invalid":',
        '{bad-json',
        'undefined',
        '<<<not json>>>',
        '{"2026-10-10": invalid}'
      ];

      for (const payload of corruptedPayloads) {
        localStorage.setItem(STORAGE_KEYS.TODAY_PERMISSIONS, payload);
        expect(() => getStoredTodayPermissions()).not.toThrow();
        expect(getStoredTodayPermissions()).toEqual({});
      }
    });

    it('handles non-object valid JSON in TODAY_PERMISSIONS', () => {
      const nonObjectPayloads = ['null', '12345', '"string_value"', 'true', '[1, 2, 3]'];

      for (const payload of nonObjectPayloads) {
        localStorage.setItem(STORAGE_KEYS.TODAY_PERMISSIONS, payload);
        expect(() => getStoredTodayPermissions()).not.toThrow();
        expect(getStoredTodayPermissions()).toEqual({});
      }
    });

    it('handles corrupted JSON in LOGIN_ATTEMPTS gracefully', () => {
      const corruptedPayloads = [
        '{invalid_json',
        '{"count":',
        '<<<xml>>>',
        'undefined'
      ];

      for (const payload of corruptedPayloads) {
        localStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, payload);
        expect(() => getLoginAttempts()).not.toThrow();
        expect(getLoginAttempts()).toEqual({});
      }

      saveLoginAttempts({ count: 3 });
      expect(getLoginAttempts().count).toBe(3);
      clearLoginAttempts();
      expect(getLoginAttempts()).toEqual({});
    });

    it('investigates non-object JSON ("null") in LOGIN_ATTEMPTS', () => {
      // Adversarial probe: when localStorage contains "null"
      localStorage.setItem(STORAGE_KEYS.LOGIN_ATTEMPTS, 'null');
      const result = getLoginAttempts();
      // Should not throw, returns null or {}
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('handles corrupted JSON in ACTIVE_ATTENDANCE sessionStorage gracefully', () => {
      const corruptedPayloads = [
        '{broken',
        '{"listId": "abc",',
        'null',
        '123',
        '"just a string"'
      ];

      for (const payload of corruptedPayloads) {
        sessionStorage.setItem(SESSION_KEYS.ACTIVE_ATTENDANCE, payload);
        expect(() => getActiveAttendanceSession()).not.toThrow();
        if (payload === 'null') {
          expect(getActiveAttendanceSession()).toBeNull();
        }
      }

      saveActiveAttendanceSession({ listId: '10', listName: '9-B', statuses: {} });
      expect(getActiveAttendanceSession()?.listName).toBe('9-B');
      clearActiveAttendanceSession();
      expect(getActiveAttendanceSession()).toBeNull();
    });
  });

  describe('Null, Empty, and Malformed Date Deserialization', () => {
    it('returns null for empty, missing, or malformed teacher expiration dates', () => {
      expect(getStoredTeacherWeekUntil()).toBeNull();

      const invalidDates = [
        '',
        '   ',
        'invalid-date',
        'not a date',
        'null',
        'undefined',
        '2026-99-99',
        'NaN'
      ];

      for (const inv of invalidDates) {
        localStorage.setItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL, inv);
        expect(getStoredTeacherWeekUntil()).toBeNull();
      }
    });

    it('correctly deserializes ISO 8601 date strings to epoch milliseconds', () => {
      const iso = '2026-10-15T12:00:00.000Z';
      const expectedTime = new Date(iso).getTime();

      localStorage.setItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL, iso);
      expect(getStoredTeacherWeekUntil()).toBe(expectedTime);
    });

    it('evaluates teacher session validity strictly against expiration', () => {
      expect(getStoredTeacher()).toBeNull();

      // 1. Teacher exists but date is expired in the past
      const pastDate = new Date(Date.now() - 60000).toISOString();
      saveTeacherSession('Ali Hoca', pastDate);
      expect(getStoredTeacher()).toBe('Ali Hoca');
      let session = getRememberedTeacher();
      expect(session.name).toBe('Ali Hoca');
      expect(session.valid).toBe(false);

      // 2. Teacher exists and date is in the future
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      saveTeacherSession('Ali Hoca', futureDate);
      expect(getStoredTeacher()).toBe('Ali Hoca');
      session = getRememberedTeacher();
      expect(session.name).toBe('Ali Hoca');
      expect(session.valid).toBe(true);

      // 3. Name is empty string even if date is future
      saveTeacherSession('', futureDate);
      session = getRememberedTeacher();
      expect(session.valid).toBe(false);

      // 4. Date is malformed string
      localStorage.setItem(STORAGE_KEYS.TEACHER_NAME, 'Veli Hoca');
      localStorage.setItem(STORAGE_KEYS.TEACHER_WEEK_UNTIL, 'corrupted-timestamp');
      session = getRememberedTeacher();
      expect(session.valid).toBe(false);

      // 5. Cleared session
      clearTeacherSession();
      session = getRememberedTeacher();
      expect(session.name).toBe('');
      expect(session.until).toBe('');
      expect(session.valid).toBe(false);
    });
  });

  describe('Storage Quota Exceeded & Storage Errors', () => {
    it('survives QuotaExceededError when saving permissions', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        throw err;
      });

      expect(() => {
        saveStoredTodayPermissions({ s1: 'absent' });
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('survives QuotaExceededError when saving login attempts', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      expect(() => {
        saveLoginAttempts({ count: 5, blockedUntil: Date.now() + 60000 });
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('survives QuotaExceededError when saving active attendance session', () => {
      const setItemSpy = vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      expect(() => {
        saveActiveAttendanceSession({ listId: '1', listName: '9-A', statuses: {} });
      }).not.toThrow();

      setItemSpy.mockRestore();
    });
  });
});

describe('Empirical Challenge: Device Token Format & Uniqueness', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates strictly 64-character lowercase hex tokens', () => {
    const token = getDeviceToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates 500 unique tokens across repeated iterations with 0 collisions', () => {
    const tokens = new Set<string>();
    const iterations = 500;

    for (let i = 0; i < iterations; i++) {
      localStorage.clear();
      const token = getDeviceToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      tokens.add(token);
    }

    expect(tokens.size).toBe(iterations);
  });

  it('displays balanced hex character distribution across entropy sample', () => {
    const chars = new Map<string, number>();
    for (let i = 0; i < 50; i++) {
      localStorage.clear();
      const token = getDeviceToken();
      for (const ch of token) {
        chars.set(ch, (chars.get(ch) || 0) + 1);
      }
    }

    // All 16 hex characters [0-9, a-f] must be observed
    for (let c = 0; c < 16; c++) {
      const hexChar = c.toString(16);
      expect(chars.has(hexChar)).toBe(true);
      expect(chars.get(hexChar)!).toBeGreaterThan(0);
    }
  });

  it('is idempotent across repeated invocations without clearing storage', () => {
    const first = getDeviceToken();
    for (let i = 0; i < 20; i++) {
      expect(getDeviceToken()).toBe(first);
    }
  });

  it('self-heals and replaces invalid / corrupted tokens in localStorage', () => {
    const corruptedTokens = [
      'too-short',
      '0123456789abcdef', // 16 chars
      '0123456789abcdef'.repeat(3) + 'abc', // 51 chars
      'g'.repeat(64), // invalid non-hex char 'g'
      'A'.repeat(64), // uppercase hex (requires lowercase hex)
      ' '.repeat(64),
      '',
      'null',
      'undefined'
    ];

    for (const badToken of corruptedTokens) {
      localStorage.setItem(STORAGE_KEYS.DEVICE, badToken);
      const healedToken = getDeviceToken();
      expect(healedToken).toMatch(/^[0-9a-f]{64}$/);
      expect(healedToken).not.toBe(badToken);
      // Healed token is persisted
      expect(localStorage.getItem(STORAGE_KEYS.DEVICE)).toBe(healedToken);
    }
  });

  it('falls back to 64-char default fallback token if storage write throws', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage write prohibited');
    });

    const token = getDeviceToken();
    expect(token).toBe('0000000000000000000000000000000000000000000000000000000000000000');
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    setItemSpy.mockRestore();
  });
});

describe('Empirical Challenge: Supabase RPC & cleanRpcError Robustness', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    // Restore navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
      writable: true
    });
    setSupabaseClient(null);
  });

  describe('cleanRpcError Parsing', () => {
    it('returns offline message when navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true
      });

      expect(cleanRpcError({ message: 'Any network error' })).toBe('İnternet bağlantısı yok.');
      expect(cleanRpcError(null)).toBe('İnternet bağlantısı yok.');
      expect(cleanRpcError(undefined)).toBe('İnternet bağlantısı yok.');
    });

    it('returns default fallback message when error is null, undefined, or empty', () => {
      expect(cleanRpcError(null)).toBe('İşlem başarısız.');
      expect(cleanRpcError(undefined)).toBe('İşlem başarısız.');
      expect(cleanRpcError({})).toBe('İşlem başarısız.');
      expect(cleanRpcError({ message: '' })).toBe('İşlem başarısız.');
    });

    it('strips Postgres P0001 error code prefixes properly', () => {
      const cases = [
        { input: 'P0001: Geçersiz PIN girildi.', expected: 'Geçersiz PIN girildi.' },
        { input: 'p0001: Geçersiz PIN girildi.', expected: 'Geçersiz PIN girildi.' },
        { input: 'ERROR: P0001: Bu sınıf şu anda kilitli.', expected: 'Bu sınıf şu anda kilitli.' },
        { input: 'P0001 message: Kilit süresi doldu.', expected: 'Kilit süresi doldu.' },
        { input: 'P0001: message: Yetkisiz erişim.', expected: 'Yetkisiz erişim.' }
      ];

      for (const c of cases) {
        expect(cleanRpcError({ message: c.input })).toBe(c.expected);
      }
    });

    it('preserves informative non-P0001 messages without alteration', () => {
      const messages = [
        'Failed to fetch',
        'NetworkError when attempting to fetch resource',
        'Request timeout after 15000ms',
        'AbortError: The user aborted a request.',
        '502 Bad Gateway',
        '504 Gateway Time-out'
      ];

      for (const msg of messages) {
        expect(cleanRpcError({ message: msg })).toBe(msg);
      }
    });
  });

  describe('RPC Dispatcher Execution and Error Propagation', () => {
    it('dispatches RPC calls and resolves data correctly', async () => {
      expect(getSupabaseClient()).toBeDefined();

      const mockResult = { token: 'auth-tok-123', role: 'teacher', displayName: 'Mehmet Hoca' };
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({ data: mockResult, error: null })
      } as any;

      setSupabaseClient(mockClient);

      const res = await rpc('app_login', {
        p_name: 'Mehmet Hoca',
        p_pin: '123456',
        p_device_token: 'abc'
      });

      expect(mockClient.rpc).toHaveBeenCalledWith('app_login', {
        p_name: 'Mehmet Hoca',
        p_pin: '123456',
        p_device_token: 'abc'
      });
      expect(res).toEqual(mockResult);
    });

    it('intercepts RPC errors and throws cleaned error message', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'P0001: Hatalı PIN veya kullanıcı adı.' }
        })
      } as any;

      setSupabaseClient(mockClient);

      await expect(
        rpc('app_login', { p_name: 'Mehmet', p_pin: '000000', p_device_token: 'x' })
      ).rejects.toThrow('Hatalı PIN veya kullanıcı adı.');
    });

    it('handles simulated network failure and connection timeouts', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Failed to fetch' }
        })
      } as any;

      setSupabaseClient(mockClient);

      await expect(
        rpc('app_bootstrap', { p_token: 'valid-token' })
      ).rejects.toThrow('Failed to fetch');
    });

    it('handles timeout errors from Supabase client', async () => {
      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'AbortError: The operation timed out.' }
        })
      } as any;

      setSupabaseClient(mockClient);

      await expect(
        rpc('begin_attendance', { p_token: 'tok', p_list_id: 'list-1' })
      ).rejects.toThrow('AbortError: The operation timed out.');
    });

    it('returns offline message when client fails while offline', async () => {
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true
      });

      const mockClient = {
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'TypeError: Network request failed' }
        })
      } as any;

      setSupabaseClient(mockClient);

      await expect(
        rpc('app_bootstrap', { p_token: 'token' })
      ).rejects.toThrow('İnternet bağlantısı yok.');
    });

    it('verifies all 17 RPC endpoints can be invoked through typed signature', async () => {
      const endpointCalls: Array<[RpcFunctionName, any]> = [
        ['app_login', { p_name: 'T', p_pin: '123456', p_device_token: 'd' }],
        ['app_bootstrap', { p_token: 'tok' }],
        ['app_logout', { p_token: 'tok' }],
        ['begin_attendance', { p_token: 'tok', p_list_id: 'l1' }],
        ['release_attendance', { p_token: 'tok', p_list_id: 'l1' }],
        ['heartbeat_attendance', { p_token: 'tok', p_list_id: 'l1' }],
        ['save_attendance', { p_token: 'tok', p_list_id: 'l1', p_statuses: {} }],
        ['get_attendance', { p_token: 'tok', p_attendance_id: 'a1' }],
        ['apply_attendance_changes', { p_token: 'tok', p_attendance_id: 'a1', p_changes: [] }],
        ['undo_attendance_change', { p_token: 'tok', p_undo_token: 'u1' }],
        ['archive_attendance', { p_token: 'tok', p_attendance_id: 'a1' }],
        ['create_list', { p_token: 'tok', p_name: '10-A', p_students: [] }],
        ['rename_list', { p_token: 'tok', p_list_id: 'l1', p_name: '10-B' }],
        ['delete_list', { p_token: 'tok', p_list_id: 'l1' }],
        ['regenerate_teacher_pin', { p_token: 'tok' }],
        ['change_admin_password', { p_token: 'tok', p_old_password: 'old', p_new_password: 'new' }],
        ['admin_export_backup', { p_token: 'tok' }]
      ];

      expect(endpointCalls).toHaveLength(17);

      const mockClient = {
        rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null })
      } as any;
      setSupabaseClient(mockClient);

      for (const [name, params] of endpointCalls) {
        await rpc(name, params);
        expect(mockClient.rpc).toHaveBeenCalledWith(name, params);
      }

      expect(mockClient.rpc).toHaveBeenCalledTimes(17);
    });
  });
});
