/**
 * Application Shell & Central Event Delegation
 * Vibecoding-Safe Native DOM Architecture
 * Eliminates dynamic inline onclick handlers via data-action event delegation
 */

import type { FeatureContext, TabName } from '../data/models/types';
import { toast } from '../shared/toast';
import { dayKey, formatHistoryDay } from '../shared/date';
import {
  revealPassword,
  switchLoginTab,
  handleAdminLogin,
  handleLogin,
  handleContinueTeacher,
  handleDifferentTeacher,
  type LoginTabMode
} from '../features/auth/auth-view';
import { handleTeacherSubmit, stopApprovalPolling } from '../features/auth/teacher-auth';
import { handleTeacherDecision, loadTeacherApprovals } from '../features/settings/teacher-management';
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
import { savePrePermissions } from '../features/pre-permissions/pre-permissions-view';
import { updateTopBar, initTopBarEvents, getPageTitle } from './top-bar';

export { updateTopBar, initTopBarEvents, getPageTitle };
import { renderListsView, renderNewListPage, createList } from '../features/lists/lists-view';
import { setStudentMode, addManualStudent, addPastedStudents, removeImportedStudent } from '../features/lists/import-roster';
import { togglePoolStudent, addFilteredPoolStudents, clearStagedPoolStudents } from '../features/lists/pool-selector';
import { handlePasteToPool, handleSingleToPool, handleDeleteFromPool, handlePoolAdminAction } from '../features/settings/pool-management';
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
import { downloadAttendanceCsv, downloadAttendanceWord } from '../features/history/export-formats';
import { toggleExportMenu, closeExportMenu } from '../features/history/export-menu';
import { ensurePdfMake } from '../shared/pdf-loader';
import {
  togglePinReveal,
  copyPin,
  regeneratePin,
  startRenameList,
  cancelClassRename,
  confirmRenameList,
  deleteList,
  downloadBackup,
  changeAdminPassword,
  updateInstitutionProfile
} from '../features/settings/admin-actions';
import { renderAdminView, setActiveSettingsTab } from '../features/settings/settings-view';
import { handleClassAdminAction } from '../features/settings/class-management';
import { renderGradesView, handleGradesAction } from '../features/grades/grades-view';
import { queryParentReport, printParentReport } from '../features/grades/parent-report-view';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Renders active view according to selected tab.
 */
export function renderCurrentTab(tab: TabName, context: FeatureContext): void {
  updateTopBar(context);

  if (tab === 'attendance') {
    renderAttendanceView(context);
    return;
  }

  if (tab === 'grades') {
    renderGradesView(context);
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
  initTopBarEvents(context);

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
    else if (a === 'start-course-attendance' && ds.listId && ds.course) {
      event.preventDefault();
      event.stopPropagation();
      await startAttendance(ds.listId, context, ds.course);
    }
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
      context.setState({
        history: { groupingMode: nextGroupingMode(context.getState().history.groupingMode) }
      });
      renderCurrentTab('lists', context);
    } else if (a === 'toggle-archive') {
      context.setState({
        navigation: { showArchived: !context.getState().navigation.showArchived }
      });
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
      const sel = selectedHistoryItem(historyGroupCache, ds.groupKey, context.getState().history.groupIndex);
      if (sel) {
        const sec = await buildPdfClassSection(sel.group.items, context);
        if (sec) {
          const pdfMake = await ensurePdfMake();
          pdfMake.createPdf({
            pageSize: 'A4',
            pageMargins: [24, 24, 24, 28],
            defaultStyle: { font: 'Roboto', fontSize: 8.5, color: '#202020' },
            content: sec.content
          }).download(`${sec.listName}-${sec.day}.pdf`);
          toast('PDF dosyası indirildi.');
        }
      }
    } else if (a === 'copy-history-all' && ds.groupKey) await copyHistoryAll(ds.groupKey, context, el);
    else if (a === 'toggle-export-menu' && ds.target) {
      toggleExportMenu(ds.target);
    } else if (a === 'export-format' && ds.format) {
      closeExportMenu(ds.target);
      const records = context.getState().history.records;
      if (ds.day) {
        const matching = records.filter((h) => !h.archivedAt && dayKey(h.takenAt) === ds.day);
        const dayLabel = formatHistoryDay(ds.day);
        if (ds.format === 'pdf') await downloadDayPdf(ds.day, context);
        else if (ds.format === 'csv') await downloadAttendanceCsv(matching, dayLabel, context);
        else if (ds.format === 'word') await downloadAttendanceWord(matching, dayLabel, context);
      } else if (ds.rangeKey) {
        const matching = records.filter((h) => !h.archivedAt || context.getState().navigation.showArchived);
        if (ds.format === 'pdf') await downloadMasterRangePdf(matching, ds.rangeKey, context);
        else if (ds.format === 'csv') await downloadAttendanceCsv(matching, ds.rangeKey, context);
        else if (ds.format === 'word') await downloadAttendanceWord(matching, ds.rangeKey, context);
      }
    } else if (a === 'switch-settings-tab' && ds.tab) {
      setActiveSettingsTab(ds.tab as any);
      renderAdminView(context);
    } else if (a === 'download-single-pdf' && ds.attendanceId) await downloadSingleAttendancePdf(ds.attendanceId, context);
    else if (a === 'copy-single-attendance' && ds.attendanceId) await copySingleAttendance(ds.attendanceId, context, el);
    else if (a === 'download-day-pdf' && ds.day) await downloadDayPdf(ds.day, context);
    else if (a === 'download-group-range-pdf' && ds.rangeKey) {
      const matching = context.getState().history.records.filter((h) => !h.archivedAt || context.getState().navigation.showArchived);
      await downloadMasterRangePdf(matching, ds.rangeKey, context);
    } else if (a === 'set-student-mode' && ds.mode) setStudentMode(ds.mode as 'pool' | 'file' | 'manual');
    else if (a === 'toggle-pool-student') {
      togglePoolStudent({
        first: ds.first || '',
        last: ds.last || '',
        tc: ds.tc || ''
      });
    } else if (a === 'add-filtered-pool-students') addFilteredPoolStudents(context);
    else if (a === 'clear-staged-pool-students') clearStagedPoolStudents();
    else if (a === 'save-pasted-to-pool') { await handlePasteToPool(context); renderAdminView(context); }
    else if (a === 'save-single-to-pool') { await handleSingleToPool(context); renderAdminView(context); }
    else if (a === 'delete-pool-student' && ds.studentId) { await handleDeleteFromPool(ds.studentId, context); renderAdminView(context); }
    else if (await handlePoolAdminAction(a, ds, context)) { renderAdminView(context); }
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
    else if (await handleClassAdminAction(a, ds, context)) { renderAdminView(context); }
    else if (a === 'change-admin-password') await changeAdminPassword(context);
    else if (a === 'update-institution-profile') { await updateInstitutionProfile(context); renderAdminView(context); }
    else if (a === 'download-backup') await downloadBackup(context);
    else if (a === 'reveal-password' && ds.target) revealPassword(ds.target);
    else if (await handleGradesAction(a, ds, context)) {
      if (a === 'open-grades') {
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (a === 'switch-login-tab' && ds.tab) {
      switchLoginTab(ds.tab as LoginTabMode);
      if (ds.tab === 'parent') {
        ($('parentTcInput') as HTMLInputElement | null)?.focus();
      } else if (ds.tab === 'admin') {
        ($('adminPasswordInput') as HTMLInputElement | null)?.focus();
      }
    } else if (a === 'teacher-submit') {
      const pinInput = ($('teacherPin') || $('loginPin')) as HTMLInputElement | null;
      if (pinInput && pinInput.value.trim()) {
        await handleLogin(context);
      } else {
        await handleTeacherSubmit(context);
      }
    } else if (a === 'continue-teacher') {
      await handleContinueTeacher(context);
    } else if (a === 'different-teacher') {
      handleDifferentTeacher();
    } else if (a === 'teacher-cancel-poll') {
      stopApprovalPolling();
    } else if (a === 'admin-login') {
      await handleAdminLogin(context);
    } else if (a === 'decide-teacher' && ds.regId && ds.decision) {
      await handleTeacherDecision(ds.regId, ds.decision as 'approve' | 'reject' | 'revoke', context);
    } else if (a === 'refresh-teacher-approvals') {
      await loadTeacherApprovals(context);
    } else if (a === 'query-parent-report') {
      await queryParentReport();
    } else if (a === 'print-parent-report') {
      printParentReport();
    }
  });

  // 4. Hash detection for parent report direct link
  const checkHash = (): void => {
    if (typeof window !== 'undefined' && (window.location.hash === '#karne' || window.location.hash === '#veli')) {
      switchLoginTab('parent');
      ($('parentTcInput') as HTMLInputElement | null)?.focus();
    }
  };
  checkHash();
  window.addEventListener('hashchange', checkHash);

  $('parentTcInput')?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      queryParentReport();
    }
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
            const newDrafts = { ...context.getState().history.stagedDrafts };
            const newModes = { ...context.getState().history.activeEditModes };
            g.items.forEach((h) => {
              delete newDrafts[h.id];
              delete newModes[h.id];
            });
            context.setState({
              history: { stagedDrafts: newDrafts, activeEditModes: newModes }
            });
          }
        }
      }
    }
  }, true);
}
