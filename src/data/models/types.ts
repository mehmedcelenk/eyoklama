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
  tcNo?: string;
  listId?: string;
  listName?: string;
}

export interface ClassList {
  id: string;
  name: string;
  students: Student[];
  courses?: string[];
  createdAt?: string;
}

export interface MasterStudent {
  id: string;
  firstName: string;
  lastName: string;
  tcNo?: string;
  classLabel?: string;
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
  courseName?: string;
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
  institutionId?: string;
  institutionSlug?: string;
  institutionName?: string;
  lists: ClassList[];
  history: AttendanceRecord[];
  teacherPin: string | null;
  teacherPinDate: string | null;
}

export interface LoginResult {
  token: string;
  role: UserRole;
  displayName: string;
  institutionId?: string;
  institutionSlug?: string;
  institutionName?: string;
  teacherWeekEndsAt?: string;
  expiresAt?: string;
}

export interface TeacherApprovalItem {
  id: string;
  institutionId: string;
  tcNo: string;
  fullName: string;
  status: 'pending' | 'approved' | 'rejected';
  deviceToken?: string;
  approvedAt?: string | null;
  createdAt: string;
}

export interface TeacherAccessResponse {
  ok?: boolean;
  status: 'approved' | 'pending' | 'rejected' | 'not_found';
  message?: string;
  error?: string;
  token?: string;
  role?: UserRole;
  displayName?: string;
  institutionId?: string;
  institutionSlug?: string;
  institutionName?: string;
  expiresAt?: string;
}

export interface TeacherApprovalCheckResponse {
  approved: boolean;
  status?: 'approved' | 'pending' | 'rejected' | 'not_found';
  error?: string;
  token?: string;
  role?: UserRole;
  displayName?: string;
  institutionId?: string;
  institutionSlug?: string;
  institutionName?: string;
  expiresAt?: string;
}

export interface AdminTeacherApprovalsResult {
  pending: TeacherApprovalItem[];
  approved: TeacherApprovalItem[];
}

export interface BackupExport {
  version?: string;
  exportedAt?: string;
  lists?: ClassList[];
  history?: AttendanceRecord[];
  [key: string]: unknown;
}

export interface GradeEntry {
  tc: string;
  grade: string;
  opinion: string;
}

export interface StudentGradeItem {
  academicYear: string;
  term: number;
  exam: number;
  courseName: string;
  grade: string;
  opinion: string;
  updatedAt?: string;
}

export interface StudentReportResponse {
  success: boolean;
  error?: string;
  student?: {
    firstName: string;
    lastName: string;
    className: string;
  };
  grades?: StudentGradeItem[];
}

export type TabName = 'lists' | 'new' | 'history' | 'admin' | 'attendance' | 'grades';

export type HistoryGroupingMode = 'day' | 'week' | 'month';

export interface SessionState {
  role: UserRole | null;
  displayName: string;
  token: string;
  institutionId?: string;
  institutionSlug?: string;
  institutionName?: string;
  teacherPin: string | null;
  teacherPinDate: string | null;
  pinRevealed: boolean;
}

export interface NavigationState {
  currentTab: TabName;
  showArchived: boolean;
}

export interface InFlightAttendance {
  mode: 'new' | 'permission';
  listId: string | null;
  listName: string;
  courseName?: string;
  startedAt?: string;
  students: Student[];
  statuses: Record<string, AttendanceStatus>;
  preExcused?: Record<string, boolean>;
  heartbeatExpiresAt?: string;
}

export type ActiveAttendance = InFlightAttendance;

export interface AttendanceState {
  active: InFlightAttendance | null;
  isSaving: boolean;
}

export interface HistoryState {
  records: AttendanceRecord[];
  groupingMode: HistoryGroupingMode;
  groupIndex: Record<string, number>;
  sessionDetailsCache: Record<string, AttendanceDetails>;
  stagedDrafts: Record<string, Record<string, AttendanceStatus>>;
  activeEditModes: Record<string, boolean>;
  undoTokens: Record<string, string>;
}

export interface RosterState {
  lists: ClassList[];
  masterPool: MasterStudent[];
  editingListId: string | null;
  isLoading: boolean;
}

export interface GradesState {
  activeListId: string | null;
  academicYear: string;
  term: number;
  exam: number;
  courseName: string;
  entries: Record<string, { grade: string; opinion: string }>;
  isSubmitting: boolean;
}

export interface AppState {
  session: SessionState;
  navigation: NavigationState;
  attendance: AttendanceState;
  history: HistoryState;
  roster: RosterState;
  grades: GradesState;
}

export type StateUpdater =
  | Partial<{
      session: Partial<SessionState>;
      navigation: Partial<NavigationState>;
      attendance: Partial<AttendanceState>;
      history: Partial<HistoryState>;
      roster: Partial<RosterState>;
      grades: Partial<GradesState>;
    }>
  | ((prev: AppState) => Partial<{
      session: Partial<SessionState>;
      navigation: Partial<NavigationState>;
      attendance: Partial<AttendanceState>;
      history: Partial<HistoryState>;
      roster: Partial<RosterState>;
      grades: Partial<GradesState>;
    }>);

export interface FeatureContext {
  getState: () => AppState;
  setState: (updater: StateUpdater) => void;
  navigate: (tab: TabName, options?: { skipClearActive?: boolean }) => void;
  refresh: () => Promise<void>;
  updateTopBar: () => void;
}

