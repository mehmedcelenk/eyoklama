import { Page, Route } from '@playwright/test';

export interface MockStudent {
  id: string;
  firstName: string;
  lastName: string;
  tcNo?: string;
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

export interface MockTeacherReg {
  id: string;
  institutionId: string;
  tcNo: string;
  fullName: string;
  status: 'pending' | 'approved' | 'rejected';
  deviceToken?: string;
  approvedAt?: string | null;
  createdAt: string;
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
  mockGrades?: Record<string, any[]>;
  teacherApprovals?: MockTeacherReg[];
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
          { id: 's1', firstName: 'Ali', lastName: 'Yılmaz', tcNo: '10000000146' },
          { id: 's2', firstName: 'Ayşe', lastName: 'Demir', tcNo: '20000000140' },
          { id: 's3', firstName: 'Mehmet', lastName: 'Kaya', tcNo: '30000000144' },
          { id: 's4', firstName: 'Zeynep', lastName: 'Çelik', tcNo: '40000000148' }
        ]
      },
      {
        id: 'list-10b',
        name: '10-B',
        students: [
          { id: 's5', firstName: 'Burak', lastName: 'Öztürk', tcNo: '50000000142' },
          { id: 's6', firstName: 'Fatma', lastName: 'Şahin', tcNo: '60000000146' }
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

      const instSlug = p('institution_slug') || 'default';
      const instName = instSlug === 'default' ? '1. Kurum' : `${instSlug.toUpperCase()} Kurumu`;

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
            institutionSlug: instSlug,
            institutionName: instName,
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
              institutionSlug: instSlug,
              institutionName: instName,
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
            institutionSlug: instSlug,
            institutionName: instName,
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
          institutionSlug: 'default',
          institutionName: '1. Kurum',
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

    case 'get_student_report': {
      const rawTc = String(p('tc') || '');
      const tc = rawTc.replace(/\D/g, '');
      let foundStudent: MockStudent | undefined;
      let foundList: MockClassList | undefined;

      for (const l of state.lists) {
        const s = l.students.find((st) => st.tcNo === tc || st.id === tc);
        if (s) {
          foundStudent = s;
          foundList = l;
          break;
        }
      }

      if (!foundStudent) {
        return { data: { success: false, error: 'Bu T.C. numarasına ait öğrenci bulunamadı.' } };
      }

      const studentGrades = state.mockGrades?.[tc] || [
        {
          academicYear: '2024-2025',
          term: 1,
          exam: 1,
          courseName: "Kur'an-ı Kerim",
          grade: '95',
          opinion: 'Ezberleri gayet başarılı.'
        }
      ];

      return {
        data: {
          success: true,
          student: {
            firstName: foundStudent.firstName,
            lastName: foundStudent.lastName,
            className: foundList?.name || '9-A'
          },
          grades: studentGrades
        }
      };
    }

    case 'save_grades_batch': {
      const entries = p('entries') || [];
      const courseName = p('course_name') || 'Genel';
      const year = p('academic_year') || '2024-2025';
      const term = p('term') || 1;
      const exam = p('exam') || 1;

      if (!state.mockGrades) state.mockGrades = {};
      for (const ent of entries) {
        const tc = ent.tc;
        if (!tc) continue;
        if (!state.mockGrades[tc]) state.mockGrades[tc] = [];
        const existingIdx = state.mockGrades[tc].findIndex(
          (g: any) => g.courseName === courseName && g.academicYear === year && g.term === term && g.exam === exam
        );
        const newGrade = {
          academicYear: year,
          term,
          exam,
          courseName,
          grade: ent.grade || '',
          opinion: ent.opinion || ''
        };
        if (existingIdx >= 0) {
          state.mockGrades[tc][existingIdx] = newGrade;
        } else {
          state.mockGrades[tc].push(newGrade);
        }
      }
      return { data: { success: true } };
    }

    case 'get_class_grades': {
      const courseName = p('course_name') || 'Genel';
      const year = p('academic_year') || '2024-2025';
      const term = p('term') || 1;
      const exam = p('exam') || 1;
      const result: Record<string, { grade: string; opinion: string }> = {};

      const allGrades = state.mockGrades || {};
      for (const tc of Object.keys(allGrades)) {
        const g = (allGrades[tc] || []).find(
          (item: any) => item.courseName === courseName && item.academicYear === year && item.term === term && item.exam === exam
        );
        if (g) {
          result[tc] = { grade: g.grade, opinion: g.opinion };
        }
      }
      return { data: result };
    }

    case 'request_teacher_access': {
      const slug = String(p('institution_slug') || 'default').toLowerCase();
      const tc = String(p('tc_no') || '').replace(/\D/g, '');
      const fullName = String(p('full_name') || '').trim();
      const deviceToken = String(p('device_token') || 'mock-device');

      if (!state.teacherApprovals) state.teacherApprovals = [];
      let reg = state.teacherApprovals.find((r) => r.tcNo === tc);

      if (reg) {
        if (reg.status === 'approved') {
          state.role = 'teacher';
          state.displayName = fullName || reg.fullName;
          state.token = 'mock-teacher-token-' + Date.now();
          return {
            data: {
              ok: true,
              status: 'approved',
              token: state.token,
              role: 'teacher',
              displayName: state.displayName,
              institutionSlug: slug,
              institutionName: slug === 'default' ? '1. Kurum' : `${slug.toUpperCase()} Kurumu`,
              expiresAt: new Date(Date.now() + 86400000 * 30).toISOString()
            }
          };
        }
        if (reg.status === 'rejected') {
          return { data: { ok: false, status: 'rejected', error: 'Giriş talebi reddedildi.' } };
        }
        return { data: { ok: false, status: 'pending', message: 'Onay bekleniyor.' } };
      }

      if (!fullName) {
        return { data: { ok: false, status: 'rejected', error: 'İlk girişte ad ve soyad gereklidir.' } };
      }

      reg = {
        id: 'reg-' + Date.now(),
        institutionId: 'inst-1',
        tcNo: tc,
        fullName,
        status: 'pending',
        deviceToken,
        createdAt: new Date().toISOString()
      };
      state.teacherApprovals.push(reg);
      return { data: { ok: false, status: 'pending', message: 'Kayıt talebiniz iletildi.' } };
    }

    case 'check_teacher_approval': {
      const slug = String(p('institution_slug') || 'default').toLowerCase();
      const tc = String(p('tc_no') || '').replace(/\D/g, '');
      const reg = (state.teacherApprovals || []).find((r) => r.tcNo === tc);
      if (!reg) {
        return { data: { approved: false, status: 'not_found' } };
      }
      if (reg.status === 'approved') {
        state.role = 'teacher';
        state.displayName = reg.fullName;
        state.token = 'mock-teacher-token-' + Date.now();
        return {
          data: {
            approved: true,
            status: 'approved',
            token: state.token,
            role: 'teacher',
            displayName: reg.fullName,
            institutionSlug: slug,
            institutionName: slug === 'default' ? '1. Kurum' : `${slug.toUpperCase()} Kurumu`,
            expiresAt: new Date(Date.now() + 86400000 * 30).toISOString()
          }
        };
      }
      return { data: { approved: false, status: reg.status } };
    }

    case 'admin_get_teacher_approvals': {
      const all = state.teacherApprovals || [];
      return {
        data: {
          pending: all.filter((r) => r.status === 'pending'),
          approved: all.filter((r) => r.status === 'approved')
        }
      };
    }

    case 'admin_decide_teacher': {
      const regId = String(p('registration_id') || '');
      const action = String(p('action') || '');
      if (!state.teacherApprovals) state.teacherApprovals = [];
      const reg = state.teacherApprovals.find((r) => r.id === regId);
      if (reg) {
        if (action === 'approve') {
          reg.status = 'approved';
          reg.approvedAt = new Date().toISOString();
        } else if (action === 'reject') {
          reg.status = 'rejected';
        } else if (action === 'revoke' || action === 'delete') {
          state.teacherApprovals = state.teacherApprovals.filter((r) => r.id !== regId);
        }
      }
      return { data: { ok: true, action, id: regId } };
    }

    default:
      return { data: { ok: true } };
  }
}
