/**
 * History In-Place Staged Editing & Undo Subsystem
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceEntry, AttendanceStatus, AppState } from '../../data/models/types';
import { toast } from '../../shared/toast';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Returns current staged draft status for entry or falls back to original record status.
 */
export function draftStatus(
  attendanceId: string,
  entry: AttendanceEntry,
  state: AppState
): AttendanceStatus {
  return state.history.stagedDrafts[attendanceId]?.[entry.studentId || (entry as any).id] ?? entry.status;
}

/**
 * Checks whether attendance session has staged in-place edits.
 */
export function hasHistoryDraft(attendanceId: string, state: AppState): boolean {
  const draft = state.history.stagedDrafts[attendanceId];
  return Boolean(draft && Object.keys(draft).length > 0);
}

/**
 * Toggles in-place edit mode on/off for a history group card.
 */
export function toggleHistoryEdit(
  key: string,
  context: FeatureContext,
  renderBody: (k: string) => void
): void {
  const state = context.getState();
  const group = (context as any)._historyGroupCache?.[key];
  if (!group) return;

  const anyEditing = group.items.some((h: any) => state.history.activeEditModes[h.id]);
  const newModes = { ...state.history.activeEditModes };
  const newDrafts = { ...state.history.stagedDrafts };

  if (anyEditing) {
    group.items.forEach((h: any) => {
      delete newModes[h.id];
      delete newDrafts[h.id];
    });
  } else {
    group.items.forEach((h: any) => {
      newModes[h.id] = true;
    });
  }

  context.setState({ history: { activeEditModes: newModes, stagedDrafts: newDrafts } });
  renderBody(key);
}

/**
 * Stages in-place status edit (+, -, ±) for a student row in history details grid.
 */
export function stageHistoryStatus(
  attendanceId: string,
  entryId: string,
  key: string,
  context: FeatureContext,
  renderBody: (k: string) => void
): void {
  const state = context.getState();
  const r = state.history.sessionDetailsCache[attendanceId];
  const e = r?.entries.find((x) => x.studentId === entryId || (x as any).id === entryId);
  if (!e) return;

  const cur = draftStatus(attendanceId, e, state);
  let nxt: AttendanceStatus;

  if (state.session.role === 'admin') {
    nxt = cur === 'present' ? 'absent' : cur === 'absent' ? 'excused' : 'present';
  } else {
    if (cur === 'present') return;
    nxt = cur === 'absent' ? 'excused' : 'absent';
  }

  const sId = e.studentId || (e as any).id;
  const newDrafts = { ...state.history.stagedDrafts };
  newDrafts[attendanceId] = { ...(newDrafts[attendanceId] || {}) };

  if (nxt === e.status) {
    delete newDrafts[attendanceId][sId];
  } else {
    newDrafts[attendanceId][sId] = nxt;
  }
  if (!Object.keys(newDrafts[attendanceId]).length) {
    delete newDrafts[attendanceId];
  }

  context.setState({ history: { stagedDrafts: newDrafts } });
  renderBody(key);
}

/**
 * Persists staged in-place edits to backend via apply_attendance_changes RPC.
 */
export async function saveHistoryChanges(
  key: string,
  context: FeatureContext,
  renderBody: (k: string) => void,
  loadGroup: (k: string) => Promise<void>
): Promise<void> {
  const state = context.getState();
  const group = (context as any)._historyGroupCache?.[key];
  if (!group) return;

  const withDrafts = group.items.filter((h: any) => {
    const draft = state.history.stagedDrafts[h.id];
    return draft && Object.keys(draft).length > 0;
  });

  if (!withDrafts.length) {
    const newModes = { ...state.history.activeEditModes };
    const newDrafts = { ...state.history.stagedDrafts };
    group.items.forEach((h: any) => {
      delete newModes[h.id];
      delete newDrafts[h.id];
    });
    context.setState({ history: { activeEditModes: newModes, stagedDrafts: newDrafts } });
    renderBody(key);
    return;
  }

  try {
    const newUndoTokens = { ...state.history.undoTokens };
    const newDrafts = { ...state.history.stagedDrafts };
    const newModes = { ...state.history.activeEditModes };
    const newCache = { ...state.history.sessionDetailsCache };

    for (const h of withDrafts) {
      const res = (await rpc('apply_attendance_changes', {
        p_token: state.session.token,
        p_attendance_id: h.id,
        p_changes: newDrafts[h.id] as any
      })) as { undoToken?: string };

      if (res?.undoToken) {
        newUndoTokens[h.id] = res.undoToken;
      }
      delete newDrafts[h.id];
      delete newModes[h.id];
      delete newCache[h.id];
    }

    context.setState({
      history: {
        undoTokens: newUndoTokens,
        stagedDrafts: newDrafts,
        activeEditModes: newModes,
        sessionDetailsCache: newCache
      }
    });

    await context.refresh();
    toast('Değişiklikler kaydedildi.');
    const card = $(`historyCard-${key}`) as HTMLDetailsElement | null;
    if (card) {
      card.open = true;
    }
    await loadGroup(key);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Değişiklikler kaydedilemedi.');
  }
}

/**
 * Triggers undo action for recently saved attendance changes.
 */
export function undoHistoryChange(
  key: string,
  context: FeatureContext,
  renderBody: (k: string) => void,
  confirmSavedUndo: (k: string) => Promise<void>
): void {
  const state = context.getState();
  const group = (context as any)._historyGroupCache?.[key];
  if (!group) return;

  const anyDraft = group.items.some((h: any) => hasHistoryDraft(h.id, state));
  if (anyDraft) {
    const newDrafts = { ...state.history.stagedDrafts };
    const newModes = { ...state.history.activeEditModes };
    group.items.forEach((h: any) => {
      delete newDrafts[h.id];
      delete newModes[h.id];
    });
    context.setState({ history: { stagedDrafts: newDrafts, activeEditModes: newModes } });
    renderBody(key);
    return;
  }

  const h = group.items.find((it: any) => state.history.undoTokens[it.id]);
  if (!h) return;

  if (state.session.role === 'admin') {
    const panel = $(`undoPanel-${key}`);
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      ($(`undoPassword-${key}`) as HTMLInputElement | null)?.focus();
    }
    return;
  }

  if (typeof window !== 'undefined' && window.confirm('Az önce kaydettiğiniz değişiklik geri alınsın mı?')) {
    confirmSavedUndo(key);
  }
}

/**
 * Reverts applied attendance changes using stored undo token.
 */
export async function confirmSavedUndo(
  key: string,
  context: FeatureContext,
  loadGroup: (k: string) => Promise<void>
): Promise<void> {
  const state = context.getState();
  const group = (context as any)._historyGroupCache?.[key];
  if (!group) return;

  const h = group.items.find((it: any) => state.history.undoTokens[it.id]);
  if (!h) return;

  const input = $(`undoPassword-${key}`) as HTMLInputElement | null;
  const password = state.session.role === 'admin' ? input?.value || '' : null;
  const undoToken = state.history.undoTokens[h.id];
  if (!undoToken) return;

  if (state.session.role === 'admin' && !password) {
    toast('Üst yetkili parolasını yazın.');
    return;
  }

  try {
    await rpc('undo_attendance_change', {
      p_token: state.session.token,
      p_attendance_id: h.id,
      p_undo_token: undoToken,
      p_password: password
    });

    const newCache = { ...state.history.sessionDetailsCache };
    const newDrafts = { ...state.history.stagedDrafts };
    const newUndoTokens = { ...state.history.undoTokens };
    delete newCache[h.id];
    delete newDrafts[h.id];
    delete newUndoTokens[h.id];

    context.setState({
      history: {
        sessionDetailsCache: newCache,
        stagedDrafts: newDrafts,
        undoTokens: newUndoTokens
      }
    });

    await context.refresh();
    toast('Son değişiklik geri alındı.');
    const card = $(`historyCard-${key}`) as HTMLDetailsElement | null;
    if (card) {
      card.open = true;
    }
    await loadGroup(key);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Geri alma işlemi başarısız.');
  }
}

/**
 * Moves an attendance record to archive via archive_attendance RPC.
 */
export async function archiveHistoryAttendance(key: string, context: FeatureContext): Promise<void> {
  const state = context.getState();
  const group = (context as any)._historyGroupCache?.[key];
  if (!group || !group.items.length) return;

  if (typeof window !== 'undefined' && !window.confirm('Bu yoklama arşivlensin mi?')) {
    return;
  }

  try {
    await rpc('archive_attendance', {
      p_token: state.session.token,
      p_attendance_id: group.items[0].id
    });
    await context.refresh();
    toast('Yoklama arşivlendi.');
    context.navigate('lists');
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Arşivlenemedi.');
  }
}
