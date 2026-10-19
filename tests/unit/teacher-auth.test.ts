import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  handleTeacherSubmit,
  stopApprovalPolling
} from '../../src/features/auth/teacher-auth';
import { switchLoginTab } from '../../src/features/auth/auth-view';
import * as rpcMod from '../../src/data/supabase/rpc';
import type { FeatureContext } from '../../src/data/models/types';

describe('Passwordless Teacher Auth & Approval Workflow', () => {
  let mockContext: FeatureContext;
  let stateObj: any;

  beforeEach(() => {
    vi.useFakeTimers();
    stateObj = {
      session: {
        role: null,
        displayName: '',
        token: '',
        teacherPin: null,
        teacherPinDate: null,
        pinRevealed: false
      }
    };

    mockContext = {
      getState: () => stateObj,
      setState: (updater: any) => {
        if (typeof updater === 'function') {
          const next = updater(stateObj);
          stateObj = { ...stateObj, ...next };
        } else {
          stateObj = { ...stateObj, ...updater };
        }
      },
      navigate: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      updateTopBar: vi.fn()
    };

    document.body.innerHTML = `
      <button id="teacherLoginTabBtn" class="active"></button>
      <button id="parentQueryTabBtn"></button>
      <button id="adminLoginTabBtn"></button>

      <div id="teacherLoginSection">
        <div id="teacherInputGroup">
          <input id="teacherInstCode" value="bilfen" />
          <input id="teacherFullName" value="Ahmet Hoca" />
          <input id="teacherTc" value="10000000146" />
          <button id="teacherSubmitBtn">Giriş Yap</button>
        </div>
        <div id="teacherPendingCard" class="hidden"></div>
        <div id="teacherLoginMsg" class="notice hidden"></div>
      </div>

      <div id="parentQuerySection" class="hidden"></div>
      <div id="adminLoginSection" class="hidden"></div>
    `;
  });

  afterEach(() => {
    stopApprovalPolling();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('switches cleanly between the 3 login tabs (teacher, parent, admin)', () => {
    switchLoginTab('parent');
    expect(document.getElementById('parentQueryTabBtn')?.classList.contains('active')).toBe(true);
    expect(document.getElementById('parentQuerySection')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('teacherLoginSection')?.classList.contains('hidden')).toBe(true);

    switchLoginTab('admin');
    expect(document.getElementById('adminLoginTabBtn')?.classList.contains('active')).toBe(true);
    expect(document.getElementById('adminLoginSection')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('parentQuerySection')?.classList.contains('hidden')).toBe(true);

    switchLoginTab('teacher');
    expect(document.getElementById('teacherLoginTabBtn')?.classList.contains('active')).toBe(true);
    expect(document.getElementById('teacherLoginSection')?.classList.contains('hidden')).toBe(false);
  });

  it('validates invalid T.C. numbers before calling RPC', async () => {
    const rpcSpy = vi.spyOn(rpcMod, 'rpc');
    const tcInput = document.getElementById('teacherTc') as HTMLInputElement;
    tcInput.value = '12345678901'; // invalid checksum

    await handleTeacherSubmit(mockContext);

    expect(rpcSpy).not.toHaveBeenCalled();
    const msgEl = document.getElementById('teacherLoginMsg');
    expect(msgEl?.classList.contains('hidden')).toBe(false);
    expect(msgEl?.textContent).toContain('Geçersiz T.C.');
  });

  it('shows pending card and starts polling when teacher status is pending, then auto-logins upon approval', async () => {
    const rpcSpy = vi.spyOn(rpcMod, 'rpc').mockImplementation(async (fnName: string) => {
      if (fnName === 'request_teacher_access') {
        return { ok: false, status: 'pending', message: 'Onay bekleniyor.' };
      }
      if (fnName === 'check_teacher_approval') {
        return {
          approved: true,
          status: 'approved',
          token: 'approved-jwt-token',
          role: 'teacher',
          displayName: 'Ahmet Hoca',
          institutionSlug: 'bilfen',
          institutionName: 'Bilfen Okulları'
        };
      }
      return {};
    });

    await handleTeacherSubmit(mockContext);

    // Pending card should be visible
    expect(document.getElementById('teacherPendingCard')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('teacherInputGroup')?.classList.contains('hidden')).toBe(true);

    // Advance 3 seconds for polling tick
    await vi.advanceTimersByTimeAsync(3100);

    expect(rpcSpy).toHaveBeenCalledWith('check_teacher_approval', expect.objectContaining({
      p_institution_slug: 'bilfen',
      p_tc_no: '10000000146'
    }));

    expect(stateObj.session.token).toBe('approved-jwt-token');
    expect(stateObj.session.displayName).toBe('Ahmet Hoca');
    expect(mockContext.refresh).toHaveBeenCalled();
  });

  it('logs in immediately without polling when teacher is already approved', async () => {
    vi.spyOn(rpcMod, 'rpc').mockResolvedValueOnce({
      ok: true,
      status: 'approved',
      token: 'instant-token',
      role: 'teacher',
      displayName: 'Ahmet Hoca',
      institutionSlug: 'bilfen',
      institutionName: 'Bilfen Okulları'
    });

    await handleTeacherSubmit(mockContext);

    expect(stateObj.session.token).toBe('instant-token');
    expect(mockContext.refresh).toHaveBeenCalled();
    expect(document.getElementById('teacherPendingCard')?.classList.contains('hidden')).toBe(true);
  });
});
