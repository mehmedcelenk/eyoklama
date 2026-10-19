/**
 * User Logout Workflow
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - strictly under 350 lines
 */

import { rpc } from '../../data/supabase/rpc';
import { getTeacherWeekUntilKey } from '../../data/storage/keys';
import type { FeatureContext } from '../../data/models/types';
import { toast } from '../../shared/toast';
import { stopApprovalPolling } from './teacher-auth';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * User logout workflow: prompts confirmation, releases attendance lock,
 * calls app_logout RPC, purges tokens and session data, and resets views.
 */
export async function logout(context: FeatureContext): Promise<void> {
  if (typeof window !== 'undefined' && !window.confirm('Çıkış yapılsın mı?')) {
    return;
  }
  stopApprovalPolling();
  const state = context.getState();
  try {
    if (state.session.token && state.attendance.active?.listId) {
      await rpc('release_attendance', {
        p_token: state.session.token,
        p_list_id: state.attendance.active.listId
      });
    }
  } catch {
    // ignore release errors
  }
  try {
    if (state.session.token) {
      await rpc('app_logout', { p_token: state.session.token });
    }
  } catch {
    // ignore logout errors
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('eyoklama_active');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getTeacherWeekUntilKey());
  }

  context.setState({
    session: {
      token: '',
      role: null,
      displayName: '',
      teacherPin: null,
      teacherPinDate: null,
      pinRevealed: false
    },
    attendance: {
      active: null,
      isSaving: false
    },
    history: {
      sessionDetailsCache: {}
    }
  });

  if (typeof document !== 'undefined') {
    $('appView')?.classList.add('hidden');
    $('loginView')?.classList.remove('hidden');
    const passInput = $('adminPasswordInput') as HTMLInputElement | null;
    if (passInput) passInput.value = '';
    const pinInput = ($('teacherPin') || $('loginPin')) as HTMLInputElement | null;
    if (pinInput) pinInput.value = '';
    $('continueLogin')?.classList.add('hidden');
    ($('teacherInputGroup') || $('credentialLogin'))?.classList.remove('hidden');
  }
  toast('Çıkış yapıldı.');
}
