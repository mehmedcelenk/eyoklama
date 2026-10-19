/**
 * Class Student Management Subsystem (Admin / Settings)
 * Vibecoding-Safe Native DOM Architecture
 * Allows viewing/editing students in classes with master pool synchronization.
 */

import type { FeatureContext, ClassList } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { displayName } from '../../shared/formatters';
import {
  handleConfirmEditStudent,
  handleRemoveStudentFromClass,
  handleAddSingleStudent,
  handleAddPoolStudent,
  handleBulkAddStudents
} from './class-student-actions';
import {
  getClassCourses,
  addCourseToClass,
  removeCourseFromClass
} from './class-course-actions';
import {
  renderClassDrawer,
  ICONS,
  type ClassDrawerMode
} from './class-drawer';
import { toast } from '../../shared/toast';

let activeManageListId: string | null = null;
let editingStudentId: string | null = null;
let classDrawerState: ClassDrawerMode = 'none';
let showFirstName = true;
let classPoolSearchQuery = '';

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

export function getActiveManageListId(): string | null {
  return activeManageListId;
}

export function setActiveManageListId(id: string | null): void {
  activeManageListId = id;
}

export function renderClassManagementHtml(context: FeatureContext): string {
  const state = context.getState();
  const lists = state.roster.lists;
  if (!lists.length) {
    return `<div class="muted tiny" style="padding:12px;text-align:center">Henüz sınıf bulunmuyor.</div>`;
  }

  return lists
    .map((l) => {
      const isExpanded = activeManageListId === l.id;

      return `<div class="class-admin-card" style="margin-bottom:8px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#080808">
        <div class="clickable" data-action="toggle-manage-class" data-list-id="${escapeHtml(l.id)}"
          style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:0.75rem;color:#777;transition:transform 0.15s;transform:${isExpanded ? 'rotate(90deg)' : 'none'}">▶</span>
            <strong style="font-size:0.95rem">${escapeHtml(l.name)}</strong>
          </div>
          <span class="muted tiny">${l.students.length} Öğrenci</span>
        </div>
        ${isExpanded ? renderClassDetailsDrawer(l, context) : ''}
      </div>`;
    })
    .join('');
}

function renderClassDetailsDrawer(list: ClassList, context: FeatureContext): string {
  const isAdmin = context.getState().session.role === 'admin';
  const students = [...(list.students || [])].sort((a, b) => {
    if (showFirstName) {
      const na = `${a.firstName} ${a.lastName}`.trim();
      const nb = `${b.firstName} ${b.lastName}`.trim();
      return na.localeCompare(nb, 'tr');
    }
    const la = `${a.lastName} ${a.firstName}`.trim();
    const lb = `${b.lastName} ${b.firstName}`.trim();
    return la.localeCompare(lb, 'tr');
  });

  const courses = list.courses || getClassCourses(list.id);
  const coursesHtml = courses
    .map(
      (c) => `<span class="pill" style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.08);padding:3px 8px;border-radius:6px;font-size:0.75rem">
        ${escapeHtml(c)}
        ${isAdmin ? `<button type="button" class="icon-btn ghost" data-action="remove-class-course" data-list-id="${escapeHtml(list.id)}" data-course="${escapeHtml(c)}" title="Dersi Kaldır" style="width:14px;height:14px;padding:0;font-size:0.75rem">×</button>` : ''}
      </span>`
    )
    .join('');

  const studentRows = students.length
    ? students
        .map((s) => {
          if (editingStudentId === s.id) {
            return `<div style="display:flex;gap:4px;align-items:center;justify-content:space-between;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.03)">
              <div style="display:flex;gap:4px;align-items:center;flex:1;min-width:0">
                <input id="editStudentFirst-${s.id}" type="text" value="${escapeHtml(s.firstName)}" placeholder="İsim" style="flex:1;min-width:55px;height:24px;min-height:24px;font-size:0.82rem;padding:0 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:inherit">
                <input id="editStudentLast-${s.id}" type="text" value="${escapeHtml(s.lastName)}" placeholder="Soyisim" style="flex:1;min-width:55px;height:24px;min-height:24px;font-size:0.82rem;padding:0 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:inherit">
                <input id="editStudentTc-${s.id}" type="text" value="${escapeHtml(s.tcNo || '')}" placeholder="T.C. No" maxlength="11" style="width:85px;height:24px;min-height:24px;font-size:0.78rem;padding:0 4px;border-radius:4px;border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.3);color:inherit;flex-shrink:0">
              </div>
              <div style="display:flex;gap:1px;align-items:center;flex-shrink:0">
                <button type="button" class="icon-btn ghost" data-action="confirm-edit-student" data-list-id="${escapeHtml(list.id)}" data-student-id="${escapeHtml(s.id || '')}" title="Kaydet" aria-label="Kaydet" style="width:24px;height:24px;display:grid;place-items:center;border:none;background:transparent;color:#fff">${ICONS.check}</button>
                <button type="button" class="icon-btn ghost" data-action="cancel-edit-student" title="Vazgeç" aria-label="Vazgeç" style="width:24px;height:24px;display:grid;place-items:center;border:none;background:transparent;color:#aaa">${ICONS.x}</button>
                ${isAdmin ? `<button type="button" class="icon-btn ghost" data-action="remove-student-from-class" data-list-id="${escapeHtml(list.id)}" data-student-id="${escapeHtml(s.id || '')}" title="Sil" style="width:24px;height:24px;display:grid;place-items:center;border:none;background:transparent;color:#e55353">${ICONS.trash}</button>` : ''}
              </div>
            </div>`;
          }
          const disp = displayName(s, showFirstName);
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.03)">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:0.88rem">${escapeHtml(disp)}</span>
              ${s.tcNo ? `<span class="badge tiny" style="opacity:0.6">${escapeHtml(s.tcNo)}</span>` : ''}
            </div>
            <button type="button" class="icon-btn ghost" data-action="start-edit-student" data-list-id="${escapeHtml(list.id)}" data-student-id="${escapeHtml(s.id || '')}" title="Düzenle / Sil" style="width:28px;height:28px">
              ${ICONS.pencil}
            </button>
          </div>`;
        })
        .join('')
    : `<div class="muted tiny" style="padding:10px;text-align:center">Öğrenci bulunamadı.</div>`;

  return `<div class="stack" style="padding:10px 12px;background:rgba(0,0,0,0.3);border-top:1px solid var(--line);gap:8px">
    ${courses.length ? `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${coursesHtml}</div>` : ''}
    <div class="hide-scrollbar" style="max-height:240px;overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none">${studentRows}</div>
    ${renderClassDrawer(list, classDrawerState, context, showFirstName, classPoolSearchQuery, isAdmin)}
  </div>`;
}

export async function handleClassAdminAction(
  action: string,
  ds: DOMStringMap,
  context: FeatureContext
): Promise<boolean> {
  if (action === 'toggle-manage-class' && ds.listId) {
    activeManageListId = activeManageListId === ds.listId ? null : ds.listId;
    editingStudentId = null;
    classDrawerState = 'none';
    return true;
  }
  if (action === 'set-class-drawer' && ds.drawer) {
    classDrawerState = ds.drawer as ClassDrawerMode;
    return true;
  }
  if (action === 'close-class-drawer') {
    classDrawerState = 'none';
    return true;
  }
  if (action === 'toggle-class-student-ad') {
    showFirstName = !showFirstName;
    return true;
  }
  if (action === 'start-edit-student' && ds.studentId) {
    editingStudentId = ds.studentId;
    return true;
  }
  if (action === 'cancel-edit-student') {
    editingStudentId = null;
    return true;
  }
  if (action === 'confirm-edit-student' && ds.listId && ds.studentId) {
    const ok = await handleConfirmEditStudent(ds.listId, ds.studentId, context);
    if (ok) editingStudentId = null;
    return true;
  }
  if (action === 'remove-student-from-class' && ds.listId && ds.studentId) {
    if (context.getState().session.role !== 'admin') {
      toast('Öğrenci silmek için kurum yöneticisi yetkisi gereklidir.');
      return true;
    }
    await handleRemoveStudentFromClass(ds.listId, ds.studentId, context);
    editingStudentId = null;
    return true;
  }
  if (action === 'add-student-to-class' && ds.listId) {
    await handleAddSingleStudent(ds.listId, context);
    return true;
  }
  if (action === 'add-pool-student-to-class' && ds.listId && ds.poolId) {
    await handleAddPoolStudent(ds.listId, ds.poolId, context);
    return true;
  }
  if (action === 'bulk-add-students-to-class' && ds.listId) {
    await handleBulkAddStudents(ds.listId, context);
    return true;
  }
  if (action === 'add-class-course' && ds.listId) {
    const input = $(`newCourseInput-${ds.listId}`) as HTMLInputElement | null;
    const name = input?.value.trim() || '';
    if (name) {
      const ok = addCourseToClass(ds.listId, name, context);
      if (ok && input) {
        input.value = '';
        classDrawerState = 'none';
      }
    }
    return true;
  }
  if (action === 'remove-class-course' && ds.listId && ds.course) {
    if (context.getState().session.role !== 'admin') {
      toast('Ders silmek için kurum yöneticisi yetkisi gereklidir.');
      return true;
    }
    removeCourseFromClass(ds.listId, ds.course, context);
    return true;
  }
  return false;
}

export function setupClassManagementListeners(renderCb: () => void): void {
  if (!activeManageListId) return;
  const poolSearchInput = $(`classPoolSearchInput-${activeManageListId}`) as HTMLInputElement | null;
  if (poolSearchInput) {
    poolSearchInput.oninput = () => {
      classPoolSearchQuery = poolSearchInput.value;
      renderCb();
    };
  }
}
