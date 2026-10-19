/**
 * Teacher Approval & Access Management Component (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Allows school administrators to approve pending teachers or revoke existing teacher access
 */

import { rpc } from '../../data/supabase/rpc';
import type {
  FeatureContext,
  TeacherApprovalItem,
  AdminTeacherApprovalsResult
} from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { toast } from '../../shared/toast';

let cachedApprovals: AdminTeacherApprovalsResult = {
  pending: [],
  approved: []
};
let isLoadingApprovals = false;

/**
 * Fetches current pending and approved teachers from Supabase.
 */
export async function loadTeacherApprovals(context: FeatureContext): Promise<void> {
  const token = context.getState().session.token;
  if (!token || isLoadingApprovals) return;

  try {
    isLoadingApprovals = true;
    const res = (await rpc('admin_get_teacher_approvals', {
      p_token: token
    })) as AdminTeacherApprovalsResult;

    if (res && Array.isArray(res.pending) && Array.isArray(res.approved)) {
      cachedApprovals = res;
      refreshTeacherManagementDom();
    }
  } catch {
    // Fallback if table or RPC is not yet created
  } finally {
    isLoadingApprovals = false;
  }
}

/**
 * Renders the HTML content inside #teacherApprovalsContainer.
 */
function buildApprovalsInnerHtml(): string {
  const { pending, approved } = cachedApprovals;

  const pendingHtml = pending.length
    ? pending
        .map(
          (t: TeacherApprovalItem) => `
        <div class="pool-admin-item" style="border-left:3px solid #f59e0b;padding-left:10px">
          <div class="pool-admin-item-info">
            <strong>${escapeHtml(t.fullName)}</strong>
            <span class="muted tiny">TC: ${escapeHtml(t.tcNo)}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button type="button" class="btn tiny" style="min-height:30px;min-width:34px;padding:4px 8px;display:inline-flex;align-items:center;justify-content:center;background:#22c55e;color:#090909;border-color:#16a34a"
              data-action="decide-teacher" data-reg-id="${escapeHtml(t.id)}" data-decision="approve" title="Onayla" aria-label="Onayla">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12l4 4L19 6"/></svg>
            </button>
            <button type="button" class="btn secondary tiny" style="min-height:30px;min-width:34px;padding:4px 8px;display:inline-flex;align-items:center;justify-content:center;color:#ef4444;border-color:rgba(239,68,68,0.3)"
              data-action="decide-teacher" data-reg-id="${escapeHtml(t.id)}" data-decision="reject" title="Reddet" aria-label="Reddet">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>`
        )
        .join('')
    : `<div class="muted tiny" style="padding:8px 0">Onay bekleyen hoca talebi yok.</div>`;

  const approvedHtml = approved.length
    ? approved
        .map(
          (t: TeacherApprovalItem) => `
        <div class="pool-admin-item">
          <div class="pool-admin-item-info">
            <strong>${escapeHtml(t.fullName)}</strong>
            <span class="muted tiny">TC: ${escapeHtml(t.tcNo)}</span>
          </div>
          <button type="button" class="icon-btn danger" title="Yetkiyi Kaldır" aria-label="Yetkiyi Kaldır"
            data-action="decide-teacher" data-reg-id="${escapeHtml(t.id)}" data-decision="revoke">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 10v6M14 10v6"/></svg>
          </button>
        </div>`
        )
        .join('')
    : `<div class="muted tiny" style="padding:8px 0">Henüz onaylanmış hoca bulunmuyor.</div>`;

  return `
    <div class="stack" style="gap:14px">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <strong style="font-size:0.88rem">Onay Bekleyen Hocalar (${pending.length})</strong>
          <button type="button" class="btn secondary tiny" data-action="refresh-teacher-approvals" title="Yenile" aria-label="Yenile" style="min-height:28px;min-width:28px;padding:2px 6px;display:inline-flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          </button>
        </div>
        <div class="pool-admin-list">${pendingHtml}</div>
      </div>

      <div style="border-top:1px solid var(--line);padding-top:10px">
        <strong style="font-size:0.88rem;display:block;margin-bottom:6px">Onaylı Hocalar (${approved.length})</strong>
        <div class="pool-admin-list">${approvedHtml}</div>
      </div>
    </div>
  `;
}

function refreshTeacherManagementDom(): void {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('teacherApprovalsContainer');
  if (container) {
    container.innerHTML = buildApprovalsInnerHtml();
  }
}

/**
 * Renders the Teacher Management section for Admin Panel.
 */
export function renderTeacherManagementHtml(_context: FeatureContext): string {
  return `
    <div class="stack" id="teacherApprovalsContainer">
      ${buildApprovalsInnerHtml()}
    </div>
  `;
}

/**
 * Handles approve / reject / revoke decisions for a teacher registration.
 */
export async function handleTeacherDecision(
  regId: string,
  decision: 'approve' | 'reject' | 'revoke',
  context: FeatureContext
): Promise<void> {
  const token = context.getState().session.token;
  if (!token || !regId) return;

  try {
    await rpc('admin_decide_teacher', {
      p_token: token,
      p_registration_id: regId,
      p_action: decision
    });

    if (decision === 'approve') {
      toast('Hoca onaylandı.');
    } else if (decision === 'reject') {
      toast('Talep reddedildi.');
    } else {
      toast('Hoca yetkisi kaldırıldı.');
    }

    await loadTeacherApprovals(context);
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'İşlem başarısız.');
  }
}

/**
 * Binds event listeners for the Teacher Management section.
 */
export function setupTeacherManagementListeners(context: FeatureContext): void {
  void loadTeacherApprovals(context);
}
