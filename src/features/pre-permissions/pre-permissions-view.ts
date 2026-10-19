/**
 * Pre-Permissions Feature View & Controller ("Günün İzinlileri")
 * Vibecoding-Safe Native DOM Architecture
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, ActiveAttendance, Student } from '../../data/models/types';
import { todayKey, dayKey } from '../../shared/date';
import { fullName, normalizeStudentKey } from '../../shared/formatters';
import { toast } from '../../shared/toast';
import { renderAttendanceView } from '../attendance/attendance-view';
import { resetAttendanceSearch } from '../attendance/attendance-search';

const TODAY_PERMISSIONS_KEY = 'eyoklama_v3_today_permissions';

/**
 * Reads today's saved permission map from localStorage.
 */
export function getTodayPermissions(): Record<string, boolean> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = JSON.parse(localStorage.getItem(TODAY_PERMISSIONS_KEY) || '{}');
    return raw[todayKey()] || {};
  } catch {
    return {};
  }
}

/**
 * Persists today's permission map to localStorage.
 */
export function saveTodayPermissions(permMap: Record<string, boolean>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = { [todayKey()]: permMap };
    localStorage.setItem(TODAY_PERMISSIONS_KEY, JSON.stringify(raw));
  } catch {
    // ignore storage errors
  }
}

/**
 * Initiates the pre-permission selection view with unique students across all classes.
 * Duplicate student records across different lists are consolidated into single entries.
 */
export function startPrePermissionView(context: FeatureContext): void {
  const state = context.getState();
  const todayPerms = getTodayPermissions();
  const uniqueStudentsMap = new Map<string, Student & { listNames: string[] }>();

  state.roster.lists.forEach((l) => {
    l.students.forEach((s) => {
      const key = normalizeStudentKey(s.firstName, s.lastName, s.id);
      const existing = uniqueStudentsMap.get(key);
      if (existing) {
        if (!existing.listNames.includes(l.name)) {
          existing.listNames.push(l.name);
        }
        if (!existing.id && s.id) {
          existing.id = s.id;
        }
      } else {
        uniqueStudentsMap.set(key, {
          ...s,
          listName: l.name,
          listNames: [l.name]
        });
      }
    });
  });

  const uniqueStudents: Student[] = Array.from(uniqueStudentsMap.values()).map((s) => ({
    ...s,
    listName: s.listNames.join(', ')
  }));
  uniqueStudents.sort((a, b) => fullName(a).localeCompare(fullName(b), 'tr'));

  const statuses: Record<string, 'excused' | 'absent'> = {};
  uniqueStudents.forEach((s) => {
    const sId = s.id || '';
    if (sId) {
      statuses[sId] = todayPerms[sId] ? 'excused' : 'absent';
    }
  });

  const active: ActiveAttendance = {
    mode: 'permission',
    listId: null,
    listName: 'Günün İzinlilerini Seç (±)',
    students: uniqueStudents,
    statuses
  };

  resetAttendanceSearch();
  context.setState({
    attendance: { active },
    navigation: { currentTab: 'attendance' }
  });
  renderAttendanceView(context);
}

/**
 * Saves selected pre-permissions and syncs changes to today's existing attendance records.
 * Ensures permissions map to all cross-list student aliases by normalized key.
 */
export async function savePrePermissions(context: FeatureContext): Promise<void> {
  const state = context.getState();
  const active = state.attendance.active;
  const permMap: Record<string, boolean> = {};

  // Build a lookup from studentId to normalized student key
  const idToKeyMap = new Map<string, string>();
  const keyToIdsMap = new Map<string, Set<string>>();

  state.roster.lists.forEach((l) => {
    l.students.forEach((s) => {
      if (s.id) {
        const key = normalizeStudentKey(s.firstName, s.lastName, s.id);
        idToKeyMap.set(s.id, key);
        if (!keyToIdsMap.has(key)) keyToIdsMap.set(key, new Set());
        keyToIdsMap.get(key)!.add(s.id);
      }
    });
  });

  if (active?.statuses) {
    Object.keys(active.statuses).forEach((id) => {
      if (active.statuses[id] === 'excused') {
        permMap[id] = true;
        const normKey = idToKeyMap.get(id);
        if (normKey) {
          const siblingIds = keyToIdsMap.get(normKey);
          siblingIds?.forEach((sibId) => {
            permMap[sibId] = true;
          });
        }
      }
    });
  }
  saveTodayPermissions(permMap);

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('eyoklama_active');
  }
  resetAttendanceSearch();
  context.setState({ attendance: { active: null } });
  context.navigate('lists');
  toast('Günün izinlileri kaydedildi.');

  const d = todayKey();
  const todayHistory = state.history.records.filter(
    (h) => !h.archivedAt && dayKey(h.takenAt) === d
  );

  if (todayHistory.length && Object.keys(permMap).length && state.session.token) {
    for (const h of todayHistory) {
      try {
        const att =
          state.history.sessionDetailsCache[h.id] ||
          ((await rpc('get_attendance', {
            p_token: state.session.token,
            p_attendance_id: h.id
          })) as any);

        const changes: Record<string, string> = {};
        if (att && att.entries) {
          att.entries.forEach((e: any) => {
            const sId = e.studentId;
            if (sId && permMap[sId] && e.status !== 'excused') {
              changes[sId] = 'excused';
            }
          });
        }
        if (Object.keys(changes).length) {
          await rpc('apply_attendance_changes', {
            p_token: state.session.token,
            p_attendance_id: h.id,
            p_changes: changes as any
          });
          const cacheCopy = { ...state.history.sessionDetailsCache };
          delete cacheCopy[h.id];
          context.setState({ history: { sessionDetailsCache: cacheCopy } });
        }
      } catch {
        // ignore sync errors
      }
    }
    await context.refresh();
  }
}
