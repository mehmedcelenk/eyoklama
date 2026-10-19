/**
 * Student Attendance Card Component
 * Vibecoding-Safe Native DOM Architecture
 * Uses data-action event delegation (Zero inline onclick handlers)
 */

import { escapeHtml } from '../../shared/sanitization';
import { displayName } from '../../shared/formatters';
import type { Student, AttendanceStatus } from '../../data/models/types';

export interface StudentCardRenderOptions {
  student: Student;
  status: AttendanceStatus;
  isLocked?: boolean;
  showFirstName?: boolean;
}

/**
 * Renders a single student attendance card element string.
 * Employs data-action="student-tap" for delegated event listening.
 */
export function renderStudentCard(options: StudentCardRenderOptions): string {
  const { student, status, isLocked = false, showFirstName = true } = options;
  const sId = student.id || '';
  const stateLabel = status === 'present' ? '+' : status === 'excused' ? '±' : '-';
  const lockedClass = isLocked ? 'locked' : '';
  const lockTag = isLocked
    ? `<span style="font-size:0.68rem;color:#d97706;margin-left:4px" title="İdare İzni (Kilitli)">🔒</span>`
    : '';
  const listTag = student.listName
    ? `<span class="muted tiny" style="margin-left:6px;font-weight:normal">(${escapeHtml(student.listName)})</span>`
    : '';

  return `<div class="student-card ${lockedClass}" data-action="student-tap" data-student-id="${escapeHtml(sId)}">
    <span class="student-name">${escapeHtml(displayName(student, showFirstName))}${listTag}${lockTag}</span>
    <span class="attendance-tag ${status} ${lockedClass}">${stateLabel}</span>
  </div>`;
}
