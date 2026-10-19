/**
 * Attendance Concurrency Lock Heartbeat
 * Vibecoding-Safe Native DOM Architecture
 * Refreshes 45s active session lock and auto-saves on disconnect/expiration
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext } from '../../data/models/types';
import { toast } from '../../shared/toast';

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Starts 45-second heartbeat interval to hold attendance lock.
 */
export function startAttendanceHeartbeat(listId: string, context: FeatureContext): void {
  stopAttendanceHeartbeat();

  heartbeatTimer = setInterval(async () => {
    const state = context.getState();
    if (!state.attendance.active || state.attendance.active.listId !== listId) {
      stopAttendanceHeartbeat();
      return;
    }

    try {
      await rpc('heartbeat_attendance', {
        p_token: state.session.token,
        p_list_id: listId
      });
    } catch {
      stopAttendanceHeartbeat();
      const curState = context.getState();
      if (curState.attendance.active && curState.attendance.active.listId) {
        try {
          await rpc('save_attendance', {
            p_token: curState.session.token,
            p_list_id: curState.attendance.active.listId,
            p_statuses: curState.attendance.active.statuses
          });
        } catch {
          // ignore auto-save errors
        }
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('eyoklama_active');
      }
      context.setState({ attendance: { active: null } });
      await context.refresh();
      toast('Oturum süresi doldu, yoklama kaydedilerek arşive eklendi.');
      context.navigate('lists');
    }
  }, 45000);
}

/**
 * Halts active heartbeat timer and cleans up references.
 */
export function stopAttendanceHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
