/**
 * Attendance Feature View & Controller
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import type { FeatureContext, AttendanceStatus } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { displayName } from '../../shared/formatters';
import { toast } from '../../shared/toast';
import { renderStudentCard } from './student-card';
import {
  renderAttendanceSearchBar,
  setupAttendanceSearchListeners,
  applyAttendanceFilter
} from './attendance-search';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;


let showFirstName = true;

/**
 * Returns current first name display mode (true = full name, false = last name only).
 */
export function isFirstNameVisible(): boolean {
  return showFirstName;
}

/**
 * Toggles first name visibility ("AD") on/off and updates the DOM in-place.
 */
export function toggleFirstName(context: FeatureContext): void {
  showFirstName = !showFirstName;
  const active = context.getState().attendance.active;
  if (!active) return;

  const toggleBtn = document.getElementById('nameToggleBtn');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', showFirstName);
    toggleBtn.setAttribute('aria-pressed', String(showFirstName));
    toggleBtn.title = showFirstName ? 'Ad ve Soyad gösteriliyor' : 'Sadece Soyad gösteriliyor';
  }

  active.students.forEach((s) => {
    const sId = s.id || '';
    const card = document.querySelector(`[data-student-id="${sId}"]`);
    if (!card) return;
    const nameEl = card.querySelector('.student-name');
    if (nameEl) {
      const isLocked = Boolean(active.preExcused?.[sId]);
      const lockTag = isLocked
        ? `<span style="font-size:0.68rem;color:#d97706;margin-left:4px" title="İdare İzni (Kilitli)">🔒</span>`
        : '';
      const listTag = s.listName
        ? `<span class="muted tiny" style="margin-left:6px;font-weight:normal">(${escapeHtml(s.listName)})</span>`
        : '';
      nameEl.innerHTML = `${escapeHtml(displayName(s, showFirstName))}${listTag}${lockTag}`;
    }
  });
}

/**
 * Renders active attendance taking screen into #attendancePage.
 */
export function renderAttendanceView(context: FeatureContext): void {
  const state = context.getState();
  const active = state.attendance.active;
  if (!active || typeof document === 'undefined') return;

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('eyoklama_active', JSON.stringify(active));
  }

  $('topNav')?.classList.add('hidden');
  document.querySelectorAll('.page').forEach((x) => x.classList.add('hidden'));

  const root = $('attendancePage');
  if (!root) return;
  root.classList.remove('hidden');

  const isPermMode = active.mode === 'permission';
  const saveAction = isPermMode ? 'save-pre-permissions' : 'save-attendance';

  const cardsHtml = active.students
    .map((s) => {
      const sId = s.id || '';
      const st = active.statuses[sId] || 'absent';
      const isLocked = Boolean(active.preExcused?.[sId]);
      return renderStudentCard({ student: s, status: st, isLocked, showFirstName });
    })
    .join('');

  const searchBarHtml = renderAttendanceSearchBar();

  root.innerHTML = `<div class="attendance-shell">
    <div class="attendance-top">
      <button type="button" class="icon-btn ghost" data-action="cancel-attendance" aria-label="Geri">
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="attendance-title">
        <strong>${escapeHtml(active.listName)}${active.courseName ? ` · <span style="font-weight:normal;opacity:0.85">${escapeHtml(active.courseName)}</span>` : ''}</strong>
      </div>
      <button type="button" id="nameToggleBtn" class="name-toggle-btn ${showFirstName ? 'active' : ''}"
        data-action="toggle-first-name" aria-pressed="${showFirstName}"
        title="${showFirstName ? 'Ad ve Soyad gösteriliyor' : 'Sadece Soyad gösteriliyor'}">AD</button>
      <div id="topCounts" class="top-counts"></div>
    </div>

    ${searchBarHtml}

    <div class="student-list">${cardsHtml}</div>

    <button type="button" class="save-fab" data-action="${saveAction}"
      aria-label="Kaydet" title="Kaydet">
      <svg viewBox="0 0 24 24"><path d="M5 12l4 4L19 6"/></svg>
    </button>
  </div>`;

  setupAttendanceSearchListeners(context);
  applyAttendanceFilter(context);
  updateAttendanceCounts(context);
}

/**
 * Updates a single student card element in the DOM without re-rendering the entire page.
 */
function updateCardElement(studentId: string, status: AttendanceStatus, isLocked: boolean): void {
  const card = document.querySelector(`[data-student-id="${studentId}"]`);
  if (!card) return;
  const tag = card.querySelector('.attendance-tag');
  if (tag) {
    tag.className = `attendance-tag ${status} ${isLocked ? 'locked' : ''}`;
    tag.textContent = status === 'present' ? '+' : status === 'excused' ? '±' : '-';
  }
}

/**
 * Handles student card click event: advances state cycle or displays lock warning.
 */
export function handleStudentTap(studentId: string, context: FeatureContext): void {
  const state = context.getState();
  const active = state.attendance.active;
  if (!active) return;

  if (active.preExcused?.[studentId]) {
    toast('Bu öğrenci idare tarafından önceden İzinli (±) olarak kilitlendi.');
    return;
  }

  if (active.mode === 'permission') {
    const cur = active.statuses[studentId] || 'absent';
    const next = cur === 'excused' ? 'absent' : 'excused';
    active.statuses[studentId] = next;
    context.setState({ attendance: { active: { ...active } } });
    updateCardElement(studentId, next, false);
    updateAttendanceCounts(context);
    return;
  }

  const cur = active.statuses[studentId] || 'absent';
  const next: AttendanceStatus = cur === 'absent' ? 'present' : cur === 'present' ? 'excused' : 'absent';
  active.statuses[studentId] = next;
  context.setState({ attendance: { active: { ...active } } });
  updateCardElement(studentId, next, false);
  updateAttendanceCounts(context);
}

/**
 * Updates top count badges (+, -, ±) and toggles save FAB dimmed state.
 */
export function updateAttendanceCounts(context: FeatureContext): void {
  const active = context.getState().attendance.active;
  if (!active) return;

  const vals = Object.values(active.statuses);
  const c = {
    present: vals.filter((x) => x === 'present').length,
    absent: vals.filter((x) => x === 'absent').length,
    excused: vals.filter((x) => x === 'excused').length
  };

  const el = $('topCounts');
  if (el) {
    if (active.mode === 'permission') {
      el.innerHTML = `<span class="top-count excused" title="İzinli (±)"><b>${c.excused}</b><span>± İzinli</span></span>`;
    } else {
      el.innerHTML = `
        <span class="top-count present" title="Var (+)"><b>${c.present}</b><span>+</span></span>
        <span class="top-count absent" title="Yok (-)"><b>${c.absent}</b><span>-</span></span>
        <span class="top-count excused" title="İzinli (±)"><b>${c.excused}</b><span>±</span></span>`;
    }
  }

  const fab = document.querySelector('.save-fab');
  if (fab) {
    const hasActive = active.mode === 'permission' ? true : c.present + c.excused > 0;
    fab.classList.toggle('dimmed', !hasActive);
  }
}

