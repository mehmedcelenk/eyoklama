/**
 * Centralized Application State Store
 * Vibecoding-Safe Native DOM Architecture
 * Deterministic unidirectional state flow
 */

import type { AppState, ActiveAttendance } from '../data/models/types';

function createInitialState(): AppState {
  let restoredActive: ActiveAttendance | null = null;
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

  return {
    role: null,
    displayName: '',
    token: '',
    lists: [],
    history: [],
    teacherPin: null,
    teacherPinDate: null,
    active: restoredActive,
    currentTab: restoredActive ? 'attendance' : 'lists',
    showArchived: false,
    historyGroupingMode: 'day',
    attendanceCache: {},
    historyGroupIndex: {},
    historyDrafts: {},
    historyEditModes: {},
    historyUndoTokens: {},
    adminEditingListId: null,
    pinRevealed: false
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
 */
export function setState(
  updater: Partial<AppState> | ((prev: AppState) => Partial<AppState>)
): void {
  const partial = typeof updater === 'function' ? updater(currentState) : updater;
  currentState = { ...currentState, ...partial };

  // Sync active attendance session to sessionStorage
  if (typeof sessionStorage !== 'undefined') {
    if (currentState.active) {
      sessionStorage.setItem('eyoklama_active', JSON.stringify(currentState.active));
    } else if (partial.active === null) {
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
  listeners.forEach((l) => l(currentState));
}

export const store = {
  getState,
  setState,
  subscribe,
  resetState
};
