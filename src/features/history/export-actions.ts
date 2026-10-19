/**
 * History Clipboard Export Subsystem
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, AttendanceDetails } from '../../data/models/types';
import { dayKey } from '../../shared/date';
import { toast } from '../../shared/toast';

/**
 * Copies a single attendance session summary to the system clipboard.
 */
export async function copySingleAttendance(
  attendanceId: string,
  context: FeatureContext,
  btn?: HTMLElement | null
): Promise<void> {
  const state = context.getState();
  try {
    let r = state.history.sessionDetailsCache[attendanceId];
    if (!r && state.session.token) {
      r = (await rpc('get_attendance', {
        p_token: state.session.token,
        p_attendance_id: attendanceId
      })) as AttendanceDetails;
      context.setState({
        history: { sessionDetailsCache: { ...state.history.sessionDetailsCache, [attendanceId]: r } }
      });
    }
    if (!r) throw new Error('Yoklama kaydı bulunamadı.');

    const h = state.history.records.find((x) => x.id === attendanceId);
    const day = h ? dayKey(h.takenAt) : '';
    const sameGroup = state.history.records
      .filter((x) => x.listId === r.attendance.listId && dayKey(x.takenAt) === day && !x.archivedAt)
      .sort((a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime());
    const sessionIdx = sameGroup.findIndex((x) => x.id === attendanceId);
    const sessionLabel = sameGroup.length > 1 ? ` (${sessionIdx + 1}/${sameGroup.length})` : '';

    const dt = new Date(r.attendance.takenAt);
    const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dt);

    const sortedEntries = [...r.entries].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')
    );
    const absent = sortedEntries.filter((e) => {
      const st = state.history.stagedDrafts[attendanceId]?.[e.studentId] ?? e.status;
      return st === 'absent';
    });
    const excused = sortedEntries.filter((e) => {
      const st = state.history.stagedDrafts[attendanceId]?.[e.studentId] ?? e.status;
      return st === 'excused';
    });

    let text = `${r.attendance.listName} · ${date}${sessionLabel}\n`;
    if (!absent.length && !excused.length) {
      text += '\n+';
    } else {
      const lines: string[] = [];
      absent.forEach((e) => lines.push(`- ${e.firstName} ${e.lastName}`));
      excused.forEach((e) => lines.push(`± ${e.firstName} ${e.lastName}`));
      text += '\n' + lines.join('\n');
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 650);
    }
    toast('Yoklama kopyalandı.');
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || 'Kopyalanamadı.');
  }
}

/**
 * Copies aggregated multi-session summary for a history group to clipboard.
 */
export async function copyHistoryAll(
  key: string,
  context: FeatureContext,
  btn?: HTMLElement | null
): Promise<void> {
  const state = context.getState();
  const cache = (context as any)._historyGroupCache?.[key];
  if (!cache || !cache.items.length) return;

  try {
    const cacheCopy = { ...state.history.sessionDetailsCache };
    for (const h of cache.items) {
      if (!cacheCopy[h.id] && state.session.token) {
        cacheCopy[h.id] = (await rpc('get_attendance', {
          p_token: state.session.token,
          p_attendance_id: h.id
        })) as AttendanceDetails;
      }
    }
    context.setState({ history: { sessionDetailsCache: cacheCopy } });

    const first = cacheCopy[cache.items[0].id];
    if (!first) return;
    const dt = new Date(first.attendance.takenAt);
    const date = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dt);
    const n = cache.items.length;

    let text = `${first.attendance.listName} · ${date}`;

    if (n === 1) {
      const h = cache.items[0];
      const r = h ? cacheCopy[h.id] : undefined;
      if (!r) return;
      const sortedEntries = [...r.entries].sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')
      );
      const absent = sortedEntries.filter((e) => {
        const st = state.history.stagedDrafts[h.id]?.[e.studentId] ?? e.status;
        return st === 'absent';
      });
      const excused = sortedEntries.filter((e) => {
        const st = state.history.stagedDrafts[h.id]?.[e.studentId] ?? e.status;
        return st === 'excused';
      });
      if (!absent.length && !excused.length) {
        text += '\n\n+';
      } else {
        const lines: string[] = [];
        absent.forEach((e) => lines.push(`- ${e.firstName} ${e.lastName}`));
        excused.forEach((e) => lines.push(`± ${e.firstName} ${e.lastName}`));
        text += '\n\n' + lines.join('\n');
      }
    } else {
      cache.items.forEach((h: any, idx: number) => {
        const r = cacheCopy[h.id];
        if (!r) return;
        const sortedEntries = [...r.entries].sort((a, b) =>
          `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr')
        );
        const absent = sortedEntries.filter((e) => {
          const st = state.history.stagedDrafts[h.id]?.[e.studentId] ?? e.status;
          return st === 'absent';
        });
        const excused = sortedEntries.filter((e) => {
          const st = state.history.stagedDrafts[h.id]?.[e.studentId] ?? e.status;
          return st === 'excused';
        });
        text += `\n\n${idx + 1}/${n}:`;
        if (!absent.length && !excused.length) {
          text += '\n+';
        } else {
          const lines: string[] = [];
          absent.forEach((e) => lines.push(`- ${e.firstName} ${e.lastName}`));
          excused.forEach((e) => lines.push(`± ${e.firstName} ${e.lastName}`));
          text += '\n' + lines.join('\n');
        }
      });
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    if (btn) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 650);
    }
    toast('Tüm yoklamalar kopyalandı.');
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || 'Kopyalanamadı.');
  }
}
