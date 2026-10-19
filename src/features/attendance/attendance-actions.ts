/**
 * Attendance Session Actions (Start, Save, Cancel)
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, ActiveAttendance, AttendanceStatus } from '../../data/models/types';
import { fullName } from '../../shared/formatters';
import { toast } from '../../shared/toast';
import { startAttendanceHeartbeat, stopAttendanceHeartbeat } from './heartbeat';
import { resetAttendanceSearch } from './attendance-search';
import { renderAttendanceView } from './attendance-view';

/**
 * Initiates an attendance session for a class list.
 * Obtains concurrency lock, checks pre-permissions, initializes statuses, and renders view.
 */
export async function startAttendance(
  listId: string,
  context: FeatureContext,
  courseName?: string
): Promise<void> {
  const state = context.getState();
  const list = state.roster.lists.find((x) => x.id === listId);
  if (!list) return;

  try {
    let lock = (await rpc('begin_attendance', {
      p_token: state.session.token,
      p_list_id: listId
    })) as { ok?: boolean; error?: string };

    if (!lock?.ok) {
      const msg = `${lock?.error || 'Bu sınıfta yoklama zaten alınıyor.'}\n\nEski kilidi kaldırıp yoklamaya devam etmek ister misiniz?`;
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        try {
          await rpc('release_attendance', {
            p_token: state.session.token,
            p_list_id: listId
          });
        } catch {
          // ignore release error
        }
        lock = (await rpc('begin_attendance', {
          p_token: state.session.token,
          p_list_id: listId
        })) as { ok?: boolean; error?: string };
      }
      if (!lock?.ok) {
        toast(lock?.error || 'Bu sınıfta yoklama zaten alınıyor.');
        return;
      }
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    toast(err.message || 'İşlem başarısız.');
    return;
  }

  // Read pre-permissions from localStorage
  let todayPerms: Record<string, boolean> = {};
  try {
    const raw = JSON.parse(localStorage.getItem('eyoklama_v3_today_permissions') || '{}');
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    todayPerms = raw[today] || {};
  } catch {
    todayPerms = {};
  }

  const sortedStudents = [...list.students].sort((a, b) =>
    fullName(a).localeCompare(fullName(b), 'tr')
  );
  const statuses: Record<string, AttendanceStatus> = {};
  const preExcused: Record<string, boolean> = {};

  sortedStudents.forEach((s) => {
    const sId = s.id || '';
    if (sId && todayPerms[sId]) {
      statuses[sId] = 'excused';
      preExcused[sId] = true;
    } else if (sId) {
      statuses[sId] = 'absent';
    }
  });

  const active: ActiveAttendance = {
    mode: 'new',
    listId: list.id,
    listName: list.name,
    courseName: courseName || undefined,
    students: sortedStudents,
    statuses,
    preExcused
  };

  context.setState({
    attendance: { active },
    navigation: { currentTab: 'attendance' }
  });
  startAttendanceHeartbeat(list.id, context);
  renderAttendanceView(context);
}

/**
 * Cancels active attendance session, releases lock, and returns to lists view.
 */
export async function cancelAttendance(context: FeatureContext): Promise<void> {
  const state = context.getState();
  const active = state.attendance.active;

  if (active) {
    const hasChanges = Object.values(active.statuses || {}).some((st) => st !== 'absent');
    if (
      hasChanges &&
      typeof window !== 'undefined' &&
      !window.confirm('Değişiklikler kaydedilmedi. Çıkılsın mı?')
    ) {
      return;
    }
  }

  const listId = active?.listId;
  stopAttendanceHeartbeat();

  if (listId && state.session.token) {
    try {
      await rpc('release_attendance', {
        p_token: state.session.token,
        p_list_id: listId
      });
    } catch {
      // ignore release error
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('eyoklama_active');
  }
  resetAttendanceSearch();
  context.setState({ attendance: { active: null } });
  context.navigate('lists');
}

/**
 * Persists attendance session to backend, halts heartbeat, and navigates to history.
 */
export async function saveNewAttendance(context: FeatureContext): Promise<void> {
  const state = context.getState();
  const active = state.attendance.active;
  if (!active || !active.listId) return;

  const vals = Object.values(active.statuses);
  const p = vals.filter((x) => x === 'present').length;
  const a = vals.filter((x) => x === 'absent').length;
  const e = vals.filter((x) => x === 'excused').length;

  if (
    typeof window !== 'undefined' &&
    !window.confirm(`Kaydet?  + ${p} · - ${a} · ± ${e}`)
  ) {
    return;
  }

  try {
    await rpc('save_attendance', {
      p_token: state.session.token,
      p_list_id: active.listId,
      p_statuses: active.statuses
    });

    stopAttendanceHeartbeat();
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('eyoklama_active');
    }
    resetAttendanceSearch();
    context.setState({ attendance: { active: null } });
    await context.refresh();
    toast('Yoklama kaydedildi ve kilitlendi.');
    context.navigate('lists');
  } catch (err: unknown) {
    const eMsg = err as { message?: string };
    toast(eMsg.message || 'Kayıt başarısız.');
  }
}
