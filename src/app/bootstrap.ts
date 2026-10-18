/**
 * eYoklama Application Bootstrap
 * Vibecoding-Safe Native DOM Architecture
 */

import '../styles/main.css';
import { rpc } from '../data/supabase/rpc';
import type { FeatureContext, BootstrapData } from '../data/models/types';
import { getState, setState } from './store';
import { router, setRouteRenderer } from './router';
import { updateTopBar, renderCurrentTab, initEventDelegation } from './shell';
import {
  renderLoginMode,
  handleLogin,
  handleContinueTeacher,
  handleDifferentTeacher,
  revealPassword,
  logout
} from '../features/auth/auth-view';
import {
  renderAttendanceView,
  handleStudentTap
} from '../features/attendance/attendance-view';
import {
  startAttendance,
  cancelAttendance,
  saveNewAttendance
} from '../features/attendance/attendance-actions';
import { startAttendanceHeartbeat } from '../features/attendance/heartbeat';
import {
  startPrePermissionView,
  savePrePermissions
} from '../features/pre-permissions/pre-permissions-view';
import { createList } from '../features/lists/lists-view';
import { addManualStudent, addPastedStudents, removeImportedStudent, setStudentMode } from '../features/lists/import-roster';
import { renderHistoryBody, historyGroupCache, loadHistoryGroup } from '../features/history/history-view';
import { nextGroupingMode } from '../features/history/grouping';
import {
  toggleHistoryEdit,
  stageHistoryStatus,
  saveHistoryChanges,
  undoHistoryChange,
  confirmSavedUndo,
  archiveHistoryAttendance
} from '../features/history/edit-drawer';
import { copySingleAttendance, copyHistoryAll } from '../features/history/export-actions';
import { downloadMasterRangePdf } from '../features/history/pdf-master';
import { downloadSingleAttendancePdf, downloadAllClassPdf } from '../features/history/pdf-class';
import { downloadDayPdf } from '../features/history/pdf-day';
import {
  togglePinReveal,
  copyPin,
  regeneratePin,
  startRenameList,
  cancelClassRename,
  confirmRenameList,
  deleteList,
  downloadBackup,
  changeAdminPassword
} from '../features/settings/admin-actions';
import { renderAdminView } from '../features/settings/settings-view';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Shared FeatureContext instance wired to reactive store and router.
 */
export const context: FeatureContext = {
  getState,
  setState,
  navigate: (tab, options) => router.navigate(tab, options),
  refresh: async () => {
    await bootstrap();
  },
  updateTopBar: () => updateTopBar(context)
};

/**
 * Registers PWA Service Worker for offline capabilities.
 */
function registerServiceWorker(): void {
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[eYoklama] ServiceWorker registration skipped:', err);
      });
    });
  }
}

/**
 * Fetches initial bootstrap payload from backend and reveals application shell.
 */
export async function bootstrap(): Promise<void> {
  const token = getState().token;
  if (!token) return;

  const data = (await rpc('app_bootstrap', { p_token: token })) as BootstrapData;
  setState({ ...(data as any), attendanceCache: {} });

  if (typeof document === 'undefined') return;

  updateTopBar(context);

  const appView = $('appView');
  const isInitialReveal = appView?.classList.contains('hidden');

  if (isInitialReveal) {
    $('loginView')?.classList.add('hidden');
    appView?.classList.remove('hidden');

    // Check for restored active attendance session before defaulting to lists
    const currentActive = getState().active;
    if (currentActive?.listId && currentActive?.students) {
      startAttendanceHeartbeat(currentActive.listId, context);
      router.navigate('attendance', { skipClearActive: true });
      renderAttendanceView(context);
    } else {
      router.navigate('lists');
    }
  } else {
    renderCurrentTab(getState().currentTab, context);
  }
}

/**
 * Binds login form interactions (credentials, continue button, enter keys).
 */
function setupAuthListeners(): void {
  $('loginBtn')?.addEventListener('click', () => handleLogin(context));
  $('continueTeacherBtn')?.addEventListener('click', () => handleContinueTeacher(context));
  $('differentTeacherBtn')?.addEventListener('click', () => handleDifferentTeacher());
  $('passwordEyeBtn')?.addEventListener('click', () => revealPassword('loginPin'));

  ['loginName', 'loginPin'].forEach((id) => {
    $(id)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        $('loginBtn')?.click();
      }
    });
  });

  const logoutBtn = $('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => logout(context);
  }

  renderLoginMode();
}

/**
 * Sets up global window shims for backward compatibility with tests and scripts.
 */
function setupGlobalWindowShims(): void {
  if (typeof window === 'undefined') return;

  const win = window as any;
  Object.assign(win, {
    bootstrap,
    logout: () => logout(context),
    switchTab: (tab: any) => router.navigate(tab),
    startAttendance: (listId: string) => startAttendance(listId, context),
    handleStudentTap: (ev: any, id: string) => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      handleStudentTap(id, context);
    },
    cancelAttendance: () => cancelAttendance(context),
    saveNewAttendance: () => saveNewAttendance(context),
    startPrePermissionView: () => startPrePermissionView(context),
    savePrePermissions: () => savePrePermissions(context),
    renderLists: () => renderCurrentTab('lists', context),
    renderHistory: () => renderCurrentTab('lists', context),
    cycleHistoryGroupingMode: () => {
      context.setState({ historyGroupingMode: nextGroupingMode(getState().historyGroupingMode) });
      renderCurrentTab('lists', context);
    },
    toggleArchiveView: () => {
      context.setState({ showArchived: !getState().showArchived });
      renderCurrentTab('lists', context);
    },
    toggleHistoryGroup: (el: any, key: string) => {
      if (el?.open) loadHistoryGroup(key, context);
    },
    toggleHistoryEdit: (key: string) => toggleHistoryEdit(key, context, (k) => renderHistoryBody(k, context)),
    stageHistoryStatus: (attId: string, entryId: string, key: string) =>
      stageHistoryStatus(attId, entryId, key, context, (k) => renderHistoryBody(k, context)),
    saveHistoryChanges: (key: string) =>
      saveHistoryChanges(key, context, (k) => renderHistoryBody(k, context), (k) => loadHistoryGroup(k, context)),
    undoHistoryChange: (key: string) =>
      undoHistoryChange(key, context, (k) => renderHistoryBody(k, context), (k) => confirmSavedUndo(k, context, (gk) => loadHistoryGroup(gk, context))),
    confirmSavedUndo: (key: string) => confirmSavedUndo(key, context, (k) => loadHistoryGroup(k, context)),
    archiveHistoryAttendance: (key: string) => archiveHistoryAttendance(key, context),
    downloadHistoryPdf: async (key: string) => {
      const g = historyGroupCache[key];
      if (g) {
        const sec = await import('../features/history/pdf-class').then((m) => m.buildPdfClassSection(g.items, context));
        if (sec && win.pdfMake) {
          win.pdfMake.createPdf({ pageSize: 'A4', pageMargins: [24, 24, 24, 28], defaultStyle: { font: 'Roboto', fontSize: 8.5 }, content: sec.content }).download(`${sec.listName}-${sec.day}.pdf`);
        }
      }
    },
    copyHistoryAll: (key: string, ev: any) => copyHistoryAll(key, context, ev?.currentTarget),
    copyHistoryGroup: (ev: any, key: string) => copyHistoryAll(key, context, ev?.currentTarget),
    copySingleAttendance: (attId: string, ev: any) => copySingleAttendance(attId, context, ev?.currentTarget),
    downloadSingleAttendancePdf: (attId: string) => downloadSingleAttendancePdf(attId, context),
    downloadDayPdf: (day: string) => downloadDayPdf(day, context),
    downloadGroupRangePdf: (rangeKey: string) => {
      const matching = getState().history.filter((h) => !h.archivedAt || getState().showArchived);
      return downloadMasterRangePdf(matching, rangeKey, context);
    },
    downloadAllClassPdf: (listId: string) => downloadAllClassPdf(listId, context),
    setStudentMode,
    addManualStudent,
    addPastedStudents,
    removeImportedStudent,
    createList: () => createList(context),
    togglePinReveal: () => { togglePinReveal(context); renderAdminView(context); },
    copyPin: () => copyPin(context),
    regeneratePin: async () => { await regeneratePin(context); renderAdminView(context); },
    startRenameList: (id: string) => { startRenameList(id, context); renderAdminView(context); },
    cancelClassRename: () => { cancelClassRename(context); renderAdminView(context); },
    confirmRenameList: async (id: string) => { await confirmRenameList(id, context); renderAdminView(context); },
    deleteList: async (id: string) => { await deleteList(id, context); renderAdminView(context); },
    changeAdminPassword: () => changeAdminPassword(context),
    downloadBackup: () => downloadBackup(context),
    revealPassword
  });
}

let appInitialized = false;

/**
 * Main application bootstrap lifecycle.
 */
export function initApp(): void {
  if (appInitialized) return;
  appInitialized = true;
  setRouteRenderer((tab) => renderCurrentTab(tab, context));
  setupAuthListeners();
  initEventDelegation(context);
  setupGlobalWindowShims();
  registerServiceWorker();

  // If session already restored, render active view
  const active = getState().active;
  if (active?.listId && active?.students) {
    $('loginView')?.classList.add('hidden');
    $('appView')?.classList.remove('hidden');
    router.navigate('attendance', { skipClearActive: true });
    renderAttendanceView(context);
  }

  console.info('[eYoklama] Native DOM Architecture initialized successfully.');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
}
