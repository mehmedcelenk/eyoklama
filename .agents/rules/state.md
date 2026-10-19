# State Management Architecture & Standards

This document establishes the canonical design for application state in eYoklama.
The central store in `src/app/store.ts` and types in `src/data/models/types.ts` implement this normalized, 6-slice domain architecture.
All feature implementations, AI agent prompts, and state modifications MUST strictly adhere to this contract.

---

## 0. Autonomous Agent State Protocol
Whenever reading or mutating state in any task:
1. **Find Target Slice:** Determine which of the 6 slices (`session`, `navigation`, `attendance`, `history`, `roster`, `grades`) holds the data.
2. **Never Add Ad-Hoc Global State:** Do not attach loose properties directly to `AppState`.
3. **Use Slice-Level Updates:** Use `setState({ sliceName: { key: value } })` or `setState((prev) => ({ sliceName: { ... } }))`.
4. **Keep Local UI State Local:** Do not persist input focus, active filter text, teacher approval polling intervals, or accordion collapse states in the global store.

---

## 1. Core State Principles

1. **Single Source of Truth:** All cross-feature, multi-tenant session, persisted, and UI routing states live in the central store (`src/app/store.ts`).
2. **Normalized Slices (Domain Segregation):** State is organized into 6 distinct domain slices:
   - `session`: User identity, active role (`teacher` | `admin`), auth token, multi-tenant context (`institutionId`, `institutionSlug`, `institutionName`), teacher PIN and reveal status.
   - `navigation`: Active tab (`currentTab`), archived visibility (`showArchived`).
   - `attendance`: Active in-flight taking session (`active`), saving progress flag (`isSaving`).
   - `history`: Loaded history records, attendance cache per session, staged drafts, edit modes, undo tokens.
   - `roster`: Class lists (`lists`), school-wide master student pool (`masterPool`), active editing roster ID (`editingListId`), loading indicator (`isLoading`).
   - `grades`: Academic year, term, exam, course name, active student score entries, submission status.
3. **Immutability & Slice-Level Shallow Merging:** 
   - State transitions are immutable.
   - `store.setState(updater)` automatically performs shallow-merging at the slice level, so features can update `{ session: { institutionSlug: 'bilfen' } }` or `{ roster: { masterPool: [...] } }` without manually re-spreading the rest of the slice.
4. **Isolated Subscriptions:** Feature views subscribe to store updates. A crashing listener in one feature must never disrupt other feature listeners (wrapped in `try/catch`).

---

## 2. Canonical State Schema (`AppState`)

```typescript
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
  startedAt?: string;
  students: Student[]; // Required for offline PWA card rendering and status cycling
  statuses: Record<string, AttendanceStatus>;
  preExcused?: Record<string, boolean>;
  heartbeatExpiresAt?: string;
}

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
```

---

## 3. Persistence & Hydration Lifecycle

1. **Storage Tiering:**
   - **`sessionStorage` (`eyoklama_active`):** Only stores in-flight attendance (`state.attendance.active`). Survives accidental page reloads while taking attendance.
   - **`localStorage`:** Stores device token, remembered institution slug, teacher TC session, and cached class lists for instant PWA startup.
   - **Zero Leaks:** On logout, tab navigation away from attendance, or successful attendance save, `state.attendance.active` is set to `null` and `sessionStorage.removeItem('eyoklama_active')` is called cleanly.
2. **Hydration Order at Bootstrap:**
   - Step 1: Hydrate `session` (including `institutionId`, `institutionSlug`, `institutionName`) from storage/device token via `app_bootstrap` RPC.
   - Step 2: Hydrate `attendance.active` from `sessionStorage` (`eyoklama_active`).
   - Step 3: If in-flight active attendance exists, default `navigation.currentTab` to `'attendance'`, NOT `'lists'`.
   - Step 4: Hydrate `roster.lists`, `roster.masterPool` (when loaded), and `history.records` from bootstrap payload / local cache.

---

## 4. State Modification & Action Rules

- **No Direct Mutation:** Views must never directly mutate `store.getState()` properties.
- **Slice-Aware Updates:** State updates must use `context.setState({ sliceName: { key: value } })` or functional updaters.
- **Transient UI State Separation:** Input focus, search query strings, filter input text, pool selection checkboxes before submission, and accordion fold states that do not affect other views must remain local to the DOM/view component, not stored in the global store.
