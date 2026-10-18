/**
 * Core Data Models & Domain Types
 * Vibecoding-Safe Native DOM Architecture
 */

export type UserRole = 'teacher' | 'admin';

export type AttendanceStatus = 'present' | 'absent' | 'excused';

export interface Student {
  id?: string;
  firstName: string;
  lastName: string;
  listId?: string;
  listName?: string;
}

export interface ClassList {
  id: string;
  name: string;
  students: Student[];
  createdAt?: string;
}

export interface AttendanceEntry {
  studentId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus;
  note?: string;
}

export interface AttendanceRecord {
  id: string;
  listId: string;
  listName: string;
  takenAt: string;
  takenByName: string;
  archivedAt?: string | null;
  entries?: AttendanceEntry[];
}

export interface AttendanceDetails {
  attendance: AttendanceRecord;
  entries: AttendanceEntry[];
}

export interface AttendanceSession {
  listId: string;
  listName: string;
  statuses: Record<string, AttendanceStatus>;
  startedAt?: string;
  teacherName?: string;
}

export interface AttendanceLockResult {
  acquired?: boolean;
  locked?: boolean;
  lockedBy?: string;
  expiresAt?: string;
}

export interface AttendanceChangeItem {
  studentId: string;
  status: AttendanceStatus;
  note?: string;
}

export interface ApplyChangesResult {
  success?: boolean;
  undoToken?: string;
}

export interface UndoChangeResult {
  success?: boolean;
}

export interface BootstrapData {
  role: UserRole | null;
  displayName: string;
  lists: ClassList[];
  history: AttendanceRecord[];
  teacherPin: string | null;
  teacherPinDate: string | null;
}

export interface LoginResult {
  token: string;
  role: UserRole;
  displayName: string;
  teacherWeekEndsAt?: string;
  expiresAt?: string;
}

export interface BackupExport {
  version?: string;
  exportedAt?: string;
  lists?: ClassList[];
  history?: AttendanceRecord[];
  [key: string]: unknown;
}

export type TabName = 'lists' | 'new' | 'history' | 'admin' | 'attendance';

export type HistoryGroupingMode = 'day' | 'week' | 'month';

export interface ActiveAttendance {
  mode: 'new' | 'permission';
  listId: string | null;
  listName: string;
  students: Student[];
  statuses: Record<string, AttendanceStatus>;
  preExcused?: Record<string, boolean>;
}

export interface AppState {
  role: UserRole | null;
  displayName: string;
  token: string;
  lists: ClassList[];
  history: AttendanceRecord[];
  teacherPin: string | null;
  teacherPinDate: string | null;
  active: ActiveAttendance | null;
  currentTab: TabName;
  showArchived: boolean;
  historyGroupingMode: HistoryGroupingMode;
  attendanceCache: Record<string, AttendanceDetails>;
  historyGroupIndex: Record<string, number>;
  historyDrafts: Record<string, Record<string, AttendanceStatus>>;
  historyEditModes: Record<string, boolean>;
  historyUndoTokens: Record<string, string>;
  adminEditingListId: string | null;
  pinRevealed: boolean;
}

export interface FeatureContext {
  getState: () => AppState;
  setState: (updater: Partial<AppState> | ((prev: AppState) => Partial<AppState>)) => void;
  navigate: (tab: TabName, options?: { skipClearActive?: boolean }) => void;
  refresh: () => Promise<void>;
  updateTopBar: () => void;
}
