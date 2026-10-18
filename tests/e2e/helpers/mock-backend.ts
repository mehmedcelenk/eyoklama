import { Page, Route } from '@playwright/test';

export interface MockStudent {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MockClassList {
  id: string;
  name: string;
  students: MockStudent[];
}

export interface MockAttendanceEntry {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  status: 'present' | 'absent' | 'excused';
}

export interface MockHistoryItem {
  id: string;
  listId: string;
  listName: string;
  takenAt: string;
  takenByName: string;
  archivedAt: string | null;
  counts: {
    present: number;
    absent: number;
    excused: number;
  };
  entries?: MockAttendanceEntry[];
}

export interface MockState {
  role: 'teacher' | 'admin' | null;
  displayName: string;
  token: string;
  teacherPin: string;
  teacherPinDate: string;
  lists: MockClassList[];
  history: MockHistoryItem[];
  activeLock: { listId: string; token: string; timestamp: number } | null;
  prePermissions: Record<string, boolean>;
  rateLimits: Record<string, { count: number; blockedUntil: number }>;
}

export function createInitialMockState(): MockState {
  const today = new Date().toISOString();
  return {
    role: null,
    displayName: '',
    token: '',
    teacherPin: '123456',
    teacherPinDate: today,
    lists: [
      {
        id: 'list-9a',
        name: '9-A',
        students: [
          { id: 's1', firstName: 'Ali', lastName: 'Yılmaz' },
          { id: 's2', firstName: 'Ayşe', lastName: 'Demir' },
          { id: 's3', firstName: 'Mehmet', lastName: 'Kaya' },
          { id: 's4', firstName: 'Zeynep', lastName: 'Çelik' }
        ]
      },
      {
        id: 'list-10b',
        name: '10-B',
        students: [
          { id: 's5', firstName: 'Burak', lastName: 'Öztürk' },
          { id: 's6', firstName: 'Fatma', lastName: 'Şahin' }
        ]
      }
    ],
    history: [
      {
        id: 'att-101',
        listId: 'list-9a',
        listName: '9-A',
        takenAt: today,
        takenByName: 'Ahmet Hoca',
        archivedAt: null,
        counts: { present: 2, absent: 1, excused: 1 },
        entries: [
          { id: 'e1', studentId: 's1', firstName: 'Ali', lastName: 'Yılmaz', status: 'present' },
          { id: 'e2', studentId: 's2', firstName: 'Ayşe', lastName: 'Demir', status: 'absent' },
          { id: 'e3', studentId: 's3', firstName: 'Mehmet', lastName: 'Kaya', status: 'excused' },
          { id: 'e4', studentId: 's4', firstName: 'Zeynep', lastName: 'Çelik', status: 'present' }
        ]
      }
    ],
    activeLock: null,
    prePermissions: {},
    rateLimits: {}
  };
}

/**
 * Configure Playwright route interceptions for all Supabase RPC requests
 */
export async function setupMockSupabase(page: Page, customInitialState?: Partial<MockState>) {
  const state: MockState = {
    ...createInitialMockState(),
    ...customInitialState
  };

  // Intercept direct HTTP RPC calls from Supabase JS client
  await page.route('**/rest/v1/rpc/**', async (route: Route) => {
    const url = route.request().url();
    const rpcName = url.split('/rpc/')[1]?.split('?')[0] || '';
    let params: Record<string, any> = {};

    try {
      const postData = route.request().postData();
      if (postData) {
        params = JSON.parse(postData);
      }
    } catch {
      params = {};
    }

    const result = handleRpcCall(state, rpcName, params);

    if (result.error) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: result.error, code: result.code || 'P0001' })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result.data)
      });
    }
  });

  // Inject client-side bridge & mocks for global environment
  await page.addInitScript(({ injectedState }) => {
    try {
      Object.defineProperty(navigator, 'onLine', {
        get: () => true,
        configurable: true
      });
    } catch {}

    // Inject mock state in window for tests and shims
    (window as any).__mockState = injectedState;

    // Provide mock Supabase client directly
    (window as any).supabase = {
      createClient: () => ({
        rpc: async (name: string, params: Record<string, any> = {}) => {
          try {
            const res = await fetch(`https://pdvwyfolkyuqipfwbggb.supabase.co/rest/v1/rpc/${name}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(params)
            });
            const json = await res.json();
            if (!res.ok) {
              return { data: null, error: { message: json.message || 'Error', code: json.code } };
            }
            return { data: json, error: null };
          } catch (err: any) {
            return { data: null, error: { message: err?.message || 'Network error' } };
          }
        }
      })
    };

    // Provide mock pdfMake
    (window as any).pdfMake = {
      vfs: {},
      fonts: {},
      createPdf: (docDefinition: any) => {
        (window as any).__lastPdfDoc = docDefinition;
        return {
          download: (filename?: string) => {
            (window as any).__lastDownloadedPdf = {
              filename: filename || 'eyoklama.pdf',
              doc: docDefinition,
              timestamp: Date.now()
            };
          },
          getBlob: (cb: (blob: Blob) => void) => {
            cb(new Blob(['mock-pdf-content'], { type: 'application/pdf' }));
          }
        };
      }
    };
  }, { injectedState: state });

  return state;
}

export function handleRpcCall(state: MockState, name: string, params: Record<string, any>): { data?: any; error?: string; code?: string } {
  // Support both param prefix styles (p_name vs name)
  const p = (key: string) => params[key] ?? params[`p_${key}`];

  switch (name) {
    case 'app_login': {
      const nameVal = (p('name') || '').trim();
      const pinVal = (p('pin') || '').trim();
      const _deviceToken = p('device_token') || 'mock-device';
      void _deviceToken;

      // Admin login branch
      if (pinVal === 'admin123' || nameVal.toLowerCase() === 'admin') {
        if (pinVal !== 'admin123') {
          return { data: { ok: false, error: 'Geçersiz admin parolası.' } };
        }
        state.role = 'admin';
        state.displayName = 'Üst Yönetici';
        state.token = 'mock-admin-token-' + Date.now();
        return {
          data: {
            ok: true,
            role: 'admin',
            displayName: state.displayName,
            token: state.token,
            expiresAt: new Date(Date.now() + 86400000).toISOString()
          }
        };
      }

      // Teacher login by weekly token / continue button
      if (!nameVal && !pinVal) {
        if (state.displayName) {
          state.role = 'teacher';
          state.token = 'mock-teacher-token-' + Date.now();
          return {
            data: {
              ok: true,
              role: 'teacher',
              displayName: state.displayName,
              token: state.token,
              expiresAt: new Date(Date.now() + 7 * 86400000).toISOString()
            }
          };
        }
        return { data: { ok: false, error: 'Hoca adı veya PIN eksik.' } };
      }

      // Teacher standard login
      if (pinVal === state.teacherPin) {
        state.role = 'teacher';
        state.displayName = nameVal || 'Ahmet Hoca';
        state.token = 'mock-teacher-token-' + Date.now();
        const weekEndsAt = new Date(Date.now() + 7 * 86400000).toISOString();
        return {
          data: {
            ok: true,
            role: 'teacher',
            displayName: state.displayName,
            token: state.token,
            teacherWeekEndsAt: weekEndsAt,
            expiresAt: weekEndsAt
          }
        };
      }

      return { data: { ok: false, error: 'Hatalı PIN girdiniz.', code: 'INVALID_PIN' } };
    }

    case 'app_bootstrap': {
      return {
        data: {
          role: state.role || 'teacher',
          displayName: state.displayName || 'Ahmet Hoca',
          lists: state.lists,
          history: state.history,
          teacherPin: state.teacherPin,
          teacherPinDate: state.teacherPinDate
        }
      };
    }

    case 'app_logout': {
      state.role = null;
      state.token = '';
      return { data: { ok: true } };
    }

    case 'begin_attendance': {
      const listId = p('list_id') || p('listId');
      if (state.activeLock && state.activeLock.listId === listId && state.activeLock.token !== state.token) {
        return { data: { ok: false, error: 'Bu sınıfta yoklama zaten alınıyor.' } };
      }
      state.activeLock = { listId, token: state.token, timestamp: Date.now() };
      return { data: { ok: true } };
    }

    case 'release_attendance': {
      const listId = p('list_id') || p('listId');
      if (state.activeLock && state.activeLock.listId === listId) {
        state.activeLock = null;
      }
      return { data: { ok: true } };
    }

    case 'heartbeat_attendance': {
      const listId = p('list_id') || p('listId');
      if (state.activeLock && state.activeLock.listId === listId) {
        state.activeLock.timestamp = Date.now();
      }
      return { data: { ok: true } };
    }

    case 'save_attendance': {
      const listId = p('list_id') || p('listId');
      const statuses = p('statuses') || p('records') || {};
      const list = state.lists.find(l => l.id === listId);
      const listName = list?.name || 'Bilinmeyen Sınıf';
      const now = new Date().toISOString();

      let present = 0, absent = 0, excused = 0;
      const entries: MockAttendanceEntry[] = [];

      (list?.students || []).forEach((s, idx) => {
        const st = statuses[s.id] || 'absent';
        if (st === 'present') present++;
        else if (st === 'excused') excused++;
        else absent++;

        entries.push({
          id: `entry-${Date.now()}-${idx}`,
          studentId: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          status: st
        });
      });

      const newHistoryItem: MockHistoryItem = {
        id: `att-${Date.now()}`,
        listId,
        listName,
        takenAt: now,
        takenByName: state.displayName || 'Ahmet Hoca',
        archivedAt: null,
        counts: { present, absent, excused },
        entries
      };

      state.history.unshift(newHistoryItem);
      state.activeLock = null;
      return { data: { ok: true, id: newHistoryItem.id } };
    }

    case 'get_attendance': {
      const attId = p('attendance_id') || p('id');
      const hist = state.history.find(h => h.id === attId);
      if (!hist) return { error: 'Yoklama kaydı bulunamadı.' };

      return {
        data: {
          attendance: hist,
          entries: hist.entries || []
        }
      };
    }

    case 'apply_attendance_changes': {
      const attId = p('attendance_id') || p('id');
      const changes = p('changes') || {};
      const hist = state.history.find(h => h.id === attId);
      if (!hist) return { error: 'Yoklama kaydı bulunamadı.' };

      const undoToken = 'undo-' + Date.now();
      if (hist.entries) {
        hist.entries.forEach(e => {
          if (changes[e.id]) {
            e.status = changes[e.id];
          }
        });
        hist.counts.present = hist.entries.filter(e => e.status === 'present').length;
        hist.counts.absent = hist.entries.filter(e => e.status === 'absent').length;
        hist.counts.excused = hist.entries.filter(e => e.status === 'excused').length;
      }

      return { data: { ok: true, undoToken } };
    }

    case 'undo_attendance_change': {
      return { data: { ok: true } };
    }

    case 'archive_attendance': {
      const attId = p('attendance_id') || p('id');
      const hist = state.history.find(h => h.id === attId);
      if (hist) hist.archivedAt = new Date().toISOString();
      return { data: { ok: true } };
    }

    case 'create_list': {
      const nameVal = p('name');
      const rawStudents = p('students') || [];
      if (!nameVal) return { error: 'Sınıf adı gerekli.' };

      const newListId = 'list-' + Date.now();
      const students: MockStudent[] = rawStudents.map((s: any, i: number) => ({
        id: `s-${newListId}-${i}`,
        firstName: s.firstName,
        lastName: s.lastName
      }));

      const newList: MockClassList = {
        id: newListId,
        name: nameVal,
        students
      };
      state.lists.push(newList);
      return { data: { ok: true, id: newListId, listId: newListId } };
    }

    case 'rename_list': {
      const id = p('list_id') || p('listId') || p('id');
      const newName = p('name');
      const target = state.lists.find(l => l.id === id);
      if (target) target.name = newName;
      return { data: { ok: true } };
    }

    case 'delete_list': {
      const id = p('list_id') || p('listId') || p('id');
      state.lists = state.lists.filter(l => l.id !== id);
      return { data: { ok: true } };
    }

    case 'regenerate_teacher_pin': {
      state.teacherPin = String(Math.floor(100000 + Math.random() * 900000));
      state.teacherPinDate = new Date().toISOString();
      return { data: { ok: true, pin: state.teacherPin } };
    }

    case 'change_admin_password': {
      return { data: { ok: true } };
    }

    case 'admin_export_backup': {
      return {
        data: {
          ok: true,
          backup: {
            exportedAt: new Date().toISOString(),
            lists: state.lists,
            history: state.history
          }
        }
      };
    }

    default:
      return { data: { ok: true } };
  }
}
