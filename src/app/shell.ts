/**
 * Application Shell & Central Event Delegation
 * Vibecoding-Safe Native DOM Architecture
 * Eliminates dynamic inline onclick handlers via data-action event delegation
 */

import type { FeatureContext, TabName } from '../data/models/types';
import { toast } from '../shared/toast';
import { revealPassword, logout } from '../features/auth/auth-view';
import {
  renderAttendanceView,
  handleStudentTap,
  toggleFirstName
} from '../features/attendance/attendance-view';
import {
  startAttendance,
  cancelAttendance,
  saveNewAttendance
} from '../features/attendance/attendance-actions';
import { clearAttendanceSearch } from '../features/attendance/attendance-search';
import {
  startPrePermissionView,
  savePrePermissions,
  getTodayPermissions
} from '../features/pre-permissions/pre-permissions-view';
import { renderListsView, renderNewListPage, createList } from '../features/lists/lists-view';
import { setStudentMode, addManualStudent, addPastedStudents, removeImportedStudent } from '../features/lists/import-roster';
import {
  buildHistorySectionHtml,
  loadHistoryGroup,
  renderHistoryBody,
  historyGroupCache
} from '../features/history/history-view';
import { nextGroupingMode, selectedHistoryItem } from '../features/history/grouping';
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
import { buildPdfClassSection, downloadSingleAttendancePdf } from '../features/history/pdf-class';
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
 * Updates top navigation bar badges and conditional admin button visibility.
 */
export function updateTopBar(context: FeatureContext): void {
  const state = context.getState();
  const todayPerms = getTodayPermissions();
  const permCount = Object.keys(todayPerms).length;
  const badgeEl = $('topPermBadge');

  if (badgeEl) {
    badgeEl.textContent = String(permCount);
    badgeEl.classList.toggle('hidden', permCount === 0);
  }
  $('topAdminBtn')?.classList.toggle('hidden', state.role !== 'admin');
}

/**
 * Renders active view according to selected tab.
 */
export function renderCurrentTab(tab: TabName, context: FeatureContext): void {
  updateTopBar(context);

  if (tab === 'attendance') {
    renderAttendanceView(context);
    return;
  }

  const target = tab === 'history' ? 'lists' : tab;
  if (target === 'lists') {
    const historyHtml = buildHistorySectionHtml(context);
    renderListsView(context, historyHtml);
  } else if (target === 'new') {
    renderNewListPage(context);
  } else if (target === 'admin') {
    renderAdminView(context);
  }
}

let delegationInitialized = false;

/**
 * Attaches central data-action click delegation on the DOM.
 */
export function initEventDelegation(context: FeatureContext): void {
  if (typeof document === 'undefined') return;
  if (delegationInitialized) return;
  delegationInitialized = true;

  // 1. Top navigation button explicit bindings
  $('topBrandBtn')?.addEventListener('click', () => context.navigate('lists'));
  $('topPermBtn')?.addEventListener('click', () => startPrePermissionView(context));
  $('topAddBtn')?.addEventListener('click', () => context.navigate('new'));
  $('topAdminBtn')?.addEventListener('click', () => context.navigate('admin'));
  $('topLogoutBtn')?.addEventListener('click', () => logout(context));

  // 2. Network connectivity notification listeners
  window.addEventListener('offline', () => toast('İnternet bağlantısı kesildi.'));
  window.addEventListener('online', () => toast('İnternet bağlantısı yeniden kuruldu.'));

  // 3. Central click delegation for data-action attributes
  document.addEventListener('click', async (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const el = target.closest('[data-action]') as HTMLElement | null;
    if (!el || !el.dataset.action) return;
    const a = el.dataset.action;
    const ds = el.dataset;

    if (a === 'switch-tab') context.navigate((ds.tab || 'lists') as TabName);
    else if (a === 'start-attendance' && ds.listId) await startAttendance(ds.listId, context);
    else if (a === 'student-tap' && ds.studentId) {
      event.preventDefault();
      event.stopPropagation();
      handleStudentTap(ds.studentId, context);
    } else if (a === 'cancel-attendance') await cancelAttendance(context);
    else if (a === 'save-attendance') await saveNewAttendance(context);
    else if (a === 'save-pre-permissions') await savePrePermissions(context);
    else if (a === 'clear-attendance-search') clearAttendanceSearch(context);
    else if (a === 'toggle-first-name') toggleFirstName(context);
    else if (a === 'cycle-history-mode') {
      context.setState({ historyGroupingMode: nextGroupingMode(context.getState().historyGroupingMode) });
      renderCurrentTab('lists', context);
    } else if (a === 'toggle-archive') {
      context.setState({ showArchived: !context.getState().showArchived });
      renderCurrentTab('lists', context);
    } else if (a === 'toggle-history-edit' && ds.groupKey) {
      toggleHistoryEdit(ds.groupKey, context, (k) => renderHistoryBody(k, context));
    } else if (a === 'stage-history-status' && ds.attendanceId && ds.entryId && ds.groupKey) {
      stageHistoryStatus(ds.attendanceId, ds.entryId, ds.groupKey, context, (k) => renderHistoryBody(k, context));
    } else if (a === 'save-history-changes' && ds.groupKey) {
      await saveHistoryChanges(ds.groupKey, context, (k) => renderHistoryBody(k, context), (k) => loadHistoryGroup(k, context));
    } else if (a === 'undo-history-change' && ds.groupKey) {
      undoHistoryChange(ds.groupKey, context, (k) => renderHistoryBody(k, context), (k) => confirmSavedUndo(k, context, (gk) => loadHistoryGroup(gk, context)));
    } else if (a === 'confirm-saved-undo' && ds.groupKey) {
      await confirmSavedUndo(ds.groupKey, context, (k) => loadHistoryGroup(k, context));
    } else if (a === 'archive-history' && ds.groupKey) {
      await archiveHistoryAttendance(ds.groupKey, context);
    } else if (a === 'download-history-pdf' && ds.groupKey) {
      const sel = selectedHistoryItem(historyGroupCache, ds.groupKey, context.getState().historyGroupIndex);
      if (sel) {
        const sec = await buildPdfClassSection(sel.group.items, context);
        if (sec && typeof window !== 'undefined' && (window as any).pdfMake) {
          (window as any).pdfMake.createPdf({
            pageSize: 'A4',
            pageMargins: [24, 24, 24, 28],
            defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#202020' },
            content: sec.content
          }).download(`${sec.listName}-${sec.day}.pdf`);
        }
      }
    } else if (a === 'copy-history-all' && ds.groupKey) await copyHistoryAll(ds.groupKey, context, el);
    else if (a === 'download-single-pdf' && ds.attendanceId) await downloadSingleAttendancePdf(ds.attendanceId, context);
    else if (a === 'copy-single-attendance' && ds.attendanceId) await copySingleAttendance(ds.attendanceId, context, el);
    else if (a === 'download-day-pdf' && ds.day) await downloadDayPdf(ds.day, context);
    else if (a === 'download-group-range-pdf' && ds.rangeKey) {
      const matching = context.getState().history.filter((h) => !h.archivedAt || context.getState().showArchived);
      await downloadMasterRangePdf(matching, ds.rangeKey, context);
    } else if (a === 'set-student-mode' && ds.mode) setStudentMode(ds.mode as 'file' | 'manual');
    else if (a === 'add-manual-student') addManualStudent();
    else if (a === 'add-pasted-students') addPastedStudents();
    else if (a === 'remove-imported-student' && ds.index !== undefined) removeImportedStudent(Number(ds.index));
    else if (a === 'create-list') await createList(context);
    else if (a === 'toggle-pin-reveal') { togglePinReveal(context); renderAdminView(context); }
    else if (a === 'copy-pin') await copyPin(context);
    else if (a === 'regenerate-pin') { await regeneratePin(context); renderAdminView(context); }
    else if (a === 'start-rename-list' && ds.listId) { startRenameList(ds.listId, context); renderAdminView(context); }
    else if (a === 'confirm-rename-list' && ds.listId) { await confirmRenameList(ds.listId, context); renderAdminView(context); }
    else if (a === 'cancel-rename-list') { cancelClassRename(context); renderAdminView(context); }
    else if (a === 'delete-list' && ds.listId) { await deleteList(ds.listId, context); renderAdminView(context); }
    else if (a === 'change-admin-password') await changeAdminPassword(context);
    else if (a === 'download-backup') await downloadBackup(context);
    else if (a === 'reveal-password' && ds.target) revealPassword(ds.target);
  });

  // 4. Accordion toggle event delegation
  document.addEventListener('toggle', async (event: Event) => {
    const details = event.target as HTMLDetailsElement | null;
    if (details?.dataset?.action === 'toggle-history-group') {
      const key = details.dataset.groupKey;
      if (key) {
        if (details.open) {
          await loadHistoryGroup(key, context);
        } else {
          const g = historyGroupCache[key];
          if (g) {
            const newDrafts = { ...context.getState().historyDrafts };
            const newModes = { ...context.getState().historyEditModes };
            g.items.forEach((h) => {
              delete newDrafts[h.id];
              delete newModes[h.id];
            });
            context.setState({ historyDrafts: newDrafts, historyEditModes: newModes });
          }
        }
      }
    }
  }, true);
}
