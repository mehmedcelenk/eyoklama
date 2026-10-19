/**
 * Centralized Application State Store
 * Vibecoding-Safe Native DOM Architecture
 * Deterministic unidirectional state flow
 */

import type { AppState, InFlightAttendance, StateUpdater } from '../data/models/types';

function createInitialState(): AppState {
  let restoredActive: InFlightAttendance | null = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem('eyoklama_active');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.students && Array.isArray(parsed.students)) {
          restoredActive = parsed;
        }
      }
    }
  } catch {
    restoredActive = null;
  }

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const defaultAcademicYear = currentMonth >= 8
    ? `${currentYear}-${currentYear + 1}`
    : `${currentYear - 1}-${currentYear}`;

  return {
    session: {
      role: null,
      displayName: '',
      token: '',
      teacherPin: null,
      teacherPinDate: null,
      pinRevealed: false
    },
    navigation: {
      currentTab: restoredActive ? 'attendance' : 'lists',
      showArchived: false
    },
    attendance: {
      active: restoredActive,
      isSaving: false
    },
    history: {
      records: [],
      groupingMode: 'day',
      groupIndex: {},
      sessionDetailsCache: {},
      stagedDrafts: {},
      activeEditModes: {},
      undoTokens: {}
    },
    roster: {
      lists: [],
      masterPool: [],
      editingListId: null,
      isLoading: false
    },
    grades: {
      activeListId: null,
      academicYear: defaultAcademicYear,
      term: 1,
      exam: 1,
      courseName: '',
      entries: {},
      isSubmitting: false
    }
  };
}

let currentState: AppState = createInitialState();
const listeners = new Set<(state: AppState) => void>();

/**
 * Returns current snapshot of application state.
 */
export function getState(): AppState {
  return currentState;
}

/**
 * Updates application state and notifies all registered subscribers.
 * Supports slice-level shallow merging for immutability and predictability.
 */
export function setState(updater: StateUpdater): void {
  const partial = typeof updater === 'function' ? updater(currentState) : updater;
  currentState = {
    ...currentState,
    session: partial.session ? { ...currentState.session, ...partial.session } : currentState.session,
    navigation: partial.navigation ? { ...currentState.navigation, ...partial.navigation } : currentState.navigation,
    attendance: partial.attendance ? { ...currentState.attendance, ...partial.attendance } : currentState.attendance,
    history: partial.history ? { ...currentState.history, ...partial.history } : currentState.history,
    roster: partial.roster ? { ...currentState.roster, ...partial.roster } : currentState.roster,
    grades: partial.grades ? { ...currentState.grades, ...partial.grades } : currentState.grades
  };

  // Sync active attendance session to sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    if (currentState.attendance.active) {
      sessionStorage.setItem('eyoklama_active', JSON.stringify(currentState.attendance.active));
    } else if (partial.attendance && partial.attendance.active === null) {
      sessionStorage.removeItem('eyoklama_active');
    }
  }

  listeners.forEach((listener) => {
    try {
      listener(currentState);
    } catch (err) {
      console.error('[Store] Listener error:', err);
    }
  });
}

/**
 * Subscribes a listener function to state changes.
 * Returns an unsubscribe callback.
 */
export function subscribe(listener: (state: AppState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Resets state back to clean initial state.
 */
export function resetState(): void {
  currentState = createInitialState();
  if (typeof sessionStorage !== 'undefined' && !currentState.attendance.active) {
    sessionStorage.removeItem('eyoklama_active');
  }
  listeners.forEach((l) => {
    try {
      l(currentState);
    } catch (err) {
      console.error('[Store] Listener error:', err);
    }
  });
}

export const store = {
  getState,
  setState,
  subscribe,
  resetState
};

