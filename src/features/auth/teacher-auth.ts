/**
 * Teacher Passwordless Auth & Approval Polling Subsystem
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - data-action event delegation, strictly under 350 lines
 */

import { rpc } from '../../data/supabase/rpc';
import { getDeviceToken } from '../../data/auth/device';
import {
  getTeacherNameKey,
  getTeacherWeekUntilKey,
  getTeacherTcKey,
  getLastInstitutionSlugKey
} from '../../data/storage/keys';
import { setActiveInstitution } from '../../data/supabase/config';
import type {
  FeatureContext,
  LoginResult,
  TeacherAccessResponse,
  TeacherApprovalCheckResponse
} from '../../data/models/types';
import { isValidTcNumber, sanitizeTc } from '../../shared/tc-validator';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

function applyTeacherSession(result: LoginResult, context: FeatureContext): void {
  context.setState((prev) => ({
    session: {
      ...prev.session,
      token: result.token,
      role: result.role,
      displayName: result.displayName,
      institutionId: result.institutionId,
      institutionSlug: result.institutionSlug,
      institutionName: result.institutionName
    }
  }));

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getTeacherNameKey(), result.displayName || '');
    localStorage.setItem(getTeacherWeekUntilKey(), result.expiresAt || '');
  }
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

export function teacherMsg(msg: string, type: 'error' | 'success' = 'error'): void {
  const el = $('teacherLoginMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = `notice ${type}`;
  el.classList.remove('hidden');
}

export function clearTeacherMsg(): void {
  $('teacherLoginMsg')?.classList.add('hidden');
}

export function showPendingCard(show: boolean): void {
  const card = $('teacherPendingCard');
  const inputs = $('teacherInputGroup');
  if (show) {
    card?.classList.remove('hidden');
    inputs?.classList.add('hidden');
  } else {
    card?.classList.add('hidden');
    inputs?.classList.remove('hidden');
  }
}

/**
 * Stops any ongoing approval polling.
 */
export function stopApprovalPolling(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  showPendingCard(false);
}

/**
 * Starts background polling every 3 seconds to check if administrator has approved.
 * When approved, immediately sets session, bootstraps the app, and stops polling.
 */
export function startApprovalPolling(
  instSlug: string,
  tc: string,
  context: FeatureContext
): void {
  stopApprovalPolling();
  showPendingCard(true);

  pollingTimer = setInterval(async () => {
    try {
      const deviceToken = getDeviceToken();
      const res = (await rpc('check_teacher_approval', {
        p_institution_slug: instSlug,
        p_tc_no: tc,
        p_device_token: deviceToken
      })) as TeacherApprovalCheckResponse;

      if (res?.approved && res?.token) {
        stopApprovalPolling();
        applyTeacherSession(
          {
            token: res.token,
            role: 'teacher',
            displayName: res.displayName || 'Hoca',
            institutionId: res.institutionId,
            institutionSlug: res.institutionSlug || instSlug,
            institutionName: res.institutionName,
            expiresAt: res.expiresAt
          },
          context
        );
        await context.refresh();
      } else if (res?.status === 'rejected') {
        stopApprovalPolling();
        teacherMsg(res.error || 'Giriş talebi yönetici tarafından reddedildi.', 'error');
      }
    } catch {
      // Ignore background transient network hiccups
    }
  }, 3000);
}

/**
 * Handles teacher login / access request form submission.
 */
export async function handleTeacherSubmit(context: FeatureContext): Promise<void> {
  clearTeacherMsg();
  const instInput = $('teacherInstCode') as HTMLInputElement | null;
  const nameInput = $('teacherFullName') as HTMLInputElement | null;
  const tcInput = $('teacherTc') as HTMLInputElement | null;
  const btn = $('teacherSubmitBtn') as HTMLButtonElement | null;

  const rawSlug = instInput?.value.trim() || 'default';
  const cleanSlug = rawSlug.toLowerCase();
  const rawTc = tcInput?.value.trim() || '';
  const tc = sanitizeTc(rawTc);
  const fullName = nameInput?.value.trim() || '';

  if (!tc || tc.length !== 11) {
    teacherMsg('Lütfen 11 haneli T.C. Kimlik Numarası girin.');
    return;
  }

  if (!isValidTcNumber(tc)) {
    teacherMsg('Geçersiz T.C. Kimlik Numarası algoritması.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Kontrol ediliyor…';
    }

    // Update active institution
    setActiveInstitution(cleanSlug);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getLastInstitutionSlugKey(), cleanSlug);
      localStorage.setItem(getTeacherTcKey(), tc);
      if (fullName) {
        localStorage.setItem(getTeacherNameKey(), fullName);
      }
    }

    const deviceToken = getDeviceToken();
    const res = (await rpc('request_teacher_access', {
      p_institution_slug: cleanSlug,
      p_tc_no: tc,
      p_full_name: fullName,
      p_device_token: deviceToken
    })) as TeacherAccessResponse;

    if (res?.status === 'approved' && res?.token) {
      // Teacher is approved: login directly!
      applyTeacherSession(
        {
          token: res.token,
          role: 'teacher',
          displayName: res.displayName || fullName || 'Hoca',
          institutionId: res.institutionId,
          institutionSlug: res.institutionSlug || cleanSlug,
          institutionName: res.institutionName,
          expiresAt: res.expiresAt
        },
        context
      );
      await context.refresh();
      return;
    }

    if (res?.status === 'pending') {
      // Start background polling
      startApprovalPolling(cleanSlug, tc, context);
      return;
    }

    if (res?.status === 'rejected' || !res?.ok) {
      teacherMsg(res?.error || res?.message || 'Giriş yapılamadı.');
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    teacherMsg(e.message || 'Giriş işlemi başarısız.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Giriş Yap / Onaya Gönder';
    }
  }
}

/**
 * Pre-populates stored values (last institution slug, last TC, last full name).
 */
export function initTeacherInputs(): void {
  if (typeof localStorage === 'undefined') return;
  const instInput = $('teacherInstCode') as HTMLInputElement | null;
  const nameInput = $('teacherFullName') as HTMLInputElement | null;
  const tcInput = $('teacherTc') as HTMLInputElement | null;

  const savedSlug = localStorage.getItem(getLastInstitutionSlugKey());
  const savedTc = localStorage.getItem(getTeacherTcKey());
  const savedName = localStorage.getItem(getTeacherNameKey());

  if (instInput && !instInput.value && savedSlug) {
    instInput.value = savedSlug;
  }
  if (tcInput && !tcInput.value && savedTc) {
    tcInput.value = savedTc;
  }
  if (nameInput && !nameInput.value && savedName) {
    nameInput.value = savedName;
  }
}
