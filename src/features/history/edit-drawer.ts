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
  return state.historyDrafts[attendanceId]?.[entry.studentId || (entry as any).id] ?? entry.status;
}

/**
 * Checks whether attendance session has staged in-place edits.
 */
export function hasHistoryDraft(attendanceId: string, state: AppState): boolean {
  const draft = state.historyDrafts[attendanceId];
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

  const anyEditing = group.items.some((h: any) => state.historyEditModes[h.id]);
  const newModes = { ...state.historyEditModes };
  const newDrafts = { ...state.historyDrafts };

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

  context.setState({ historyEditModes: newModes, historyDrafts: newDrafts });
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
  const r = state.attendanceCache[attendanceId];
  const e = r?.entries.find((x) => x.studentId === entryId || (x as any).id === entryId);
  if (!e) return;

  const cur = draftStatus(attendanceId, e, state);
  let nxt: AttendanceStatus;

  if (state.role === 'admin') {
    nxt = cur === 'present' ? 'absent' : cur === 'absent' ? 'excused' : 'present';
  } else {
    if (cur === 'present') return;
    nxt = cur === 'absent' ? 'excused' : 'absent';
  }

  const sId = e.studentId || (e as any).id;
  const newDrafts = { ...state.historyDrafts };
  newDrafts[attendanceId] = { ...(newDrafts[attendanceId] || {}) };

  if (nxt === e.status) {
    delete newDrafts[attendanceId][sId];
  } else {
    newDrafts[attendanceId][sId] = nxt;
  }
  if (!Object.keys(newDrafts[attendanceId]).length) {
    delete newDrafts[attendanceId];
  }

  context.setState({ historyDrafts: newDrafts });
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
    const draft = state.historyDrafts[h.id];
    return draft && Object.keys(draft).length > 0;
  });

  if (!withDrafts.length) {
    const newModes = { ...state.historyEditModes };
    const newDrafts = { ...state.historyDrafts };
    group.items.forEach((h: any) => {
      delete newModes[h.id];
      delete newDrafts[h.id];
    });
    context.setState({ historyEditModes: newModes, historyDrafts: newDrafts });
    renderBody(key);
    return;
  }

  try {
    const newUndoTokens = { ...state.historyUndoTokens };
    const newDrafts = { ...state.historyDrafts };
    const newModes = { ...state.historyEditModes };
    const newCache = { ...state.attendanceCache };

    for (const h of withDrafts) {
      const res = (await rpc('apply_attendance_changes', {
        p_token: state.token,
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
      historyUndoTokens: newUndoTokens,
      historyDrafts: newDrafts,
      historyEditModes: newModes,
      attendanceCache: newCache
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
    const newDrafts = { ...state.historyDrafts };
    const newModes = { ...state.historyEditModes };
    group.items.forEach((h: any) => {
      delete newDrafts[h.id];
      delete newModes[h.id];
    });
    context.setState({ historyDrafts: newDrafts, historyEditModes: newModes });
    renderBody(key);
    return;
  }

  const h = group.items.find((it: any) => state.historyUndoTokens[it.id]);
  if (!h) return;

  if (state.role === 'admin') {
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

  const h = group.items.find((it: any) => state.historyUndoTokens[it.id]);
  if (!h) return;

  const input = $(`undoPassword-${key}`) as HTMLInputElement | null;
  const password = state.role === 'admin' ? input?.value || '' : null;
  const undoToken = state.historyUndoTokens[h.id];
  if (!undoToken) return;

  if (state.role === 'admin' && !password) {
    toast('Üst yetkili parolasını yazın.');
    return;
  }

  try {
    await rpc('undo_attendance_change', {
      p_token: state.token,
      p_attendance_id: h.id,
      p_undo_token: undoToken,
      p_password: password
    });

    const newCache = { ...state.attendanceCache };
    const newDrafts = { ...state.historyDrafts };
    const newUndoTokens = { ...state.historyUndoTokens };
    delete newCache[h.id];
    delete newDrafts[h.id];
    delete newUndoTokens[h.id];

    context.setState({
      attendanceCache: newCache,
      historyDrafts: newDrafts,
      historyUndoTokens: newUndoTokens
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
      p_token: state.token,
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
