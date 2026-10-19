/**
 * Teacher Grades & Kanaat Management View
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - data-action event delegation, zero inline handlers
 */

import type { FeatureContext } from '../../data/models/types';
import { escapeHtml } from '../../shared/sanitization';
import { getClassCourses } from '../settings/class-course-actions';
import {
  isGradesEditing,
  setGradesEditing,
  loadClassGrades,
  saveClassGrades,
  handleGradesAction as handleGradesActionInternal
} from './grades-actions';

export { loadClassGrades, saveClassGrades, isGradesEditing, setGradesEditing };

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Renders the student table rows within #gradesStudentContainer.
 * Switches between View Mode (clean badges & text) and Edit Mode (inputs).
 */
export function renderGradesStudentList(context: FeatureContext): void {
  const container = $('gradesStudentContainer');
  if (!container) return;

  const state = context.getState();
  const list = state.roster.lists.find((l) => l.id === state.grades.activeListId);
  if (!list) {
    container.innerHTML = '<p class="muted tiny" style="padding:16px 0;text-align:center">Lütfen yukarıdan bir sınıf seçiniz.</p>';
    return;
  }

  if (!list.students.length) {
    container.innerHTML = '<p class="muted tiny" style="padding:16px 0;text-align:center">Bu sınıfta kayıtlı öğrenci yok.</p>';
    return;
  }

  const editing = isGradesEditing();

  const html = list.students
    .map((s, idx) => {
      const tc = s.tcNo || s.id || '';
      const existing = state.grades.entries[tc] || { grade: '', opinion: '' };

      const contentHtml = editing
        ? `
          <div style="display:flex;gap:8px;align-items:center;flex:2;min-width:200px">
            <input type="text" class="student-grade-input" data-tc="${escapeHtml(tc)}"
              value="${escapeHtml(existing.grade)}" placeholder="Not" maxlength="4"
              style="width:48px;height:30px;min-height:30px;padding:2px 4px;text-align:center;font-weight:800;font-size:0.88rem;border-radius:6px;border:1px solid var(--line2);background:var(--surface2);color:var(--text);outline:none" />
            <input type="text" class="student-opinion-input" data-tc="${escapeHtml(tc)}"
              value="${escapeHtml(existing.opinion)}" placeholder="Kanaat / ders notu..."
              style="flex:1;height:30px;min-height:30px;padding:4px 8px;font-size:0.82rem;border-radius:6px;border:1px solid var(--line2);background:var(--surface2);color:var(--text);outline:none" />
          </div>
        `
        : `
          <div style="display:flex;gap:8px;align-items:center;flex:2;min-width:200px">
            ${
              existing.grade
                ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:30px;min-height:30px;padding:0 4px;border-radius:6px;background:var(--surface2);border:1px solid var(--line2);font-weight:800;font-size:0.88rem;color:var(--text)">${escapeHtml(existing.grade)}</span>`
                : `<span style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:30px;min-height:30px;padding:0 4px;border-radius:6px;border:1px dashed var(--line2);color:var(--muted);font-size:0.82rem;opacity:0.6">—</span>`
            }
            <div style="flex:1;min-height:30px;display:flex;align-items:center">
              ${
                existing.opinion
                  ? `<div style="font-size:0.84rem;color:#e0e0e0;padding:4px 8px;background:var(--surface2);border-radius:6px;border-left:3px solid var(--accent);word-break:break-word;width:100%">${escapeHtml(existing.opinion)}</div>`
                  : `<span class="muted tiny" style="font-style:italic;opacity:0.55">Kanaat belirtilmemiş</span>`
              }
            </div>
          </div>
        `;

      return `
        <div class="grade-student-row" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:130px">
            <strong style="font-size:0.88rem">${idx + 1}. ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</strong>
            ${s.tcNo ? `<div class="muted tiny" style="opacity:0.6">${escapeHtml(s.tcNo)}</div>` : ''}
          </div>
          ${contentHtml}
        </div>
      `;
    })
    .join('');

  container.innerHTML = html;
}

/**
 * Main view renderer for the Grades Page.
 */
export function renderGradesView(context: FeatureContext): void {
  const page = $('gradesPage');
  if (!page) return;

  const state = context.getState();
  const lists = state.roster.lists;
  let activeListId = state.grades.activeListId;
  if (!activeListId && lists.length > 0 && lists[0]) {
    activeListId = lists[0].id;
    context.setState({ grades: { activeListId } });
  }

  const classSelectOptions = lists
    .map((l) => `<option value="${escapeHtml(l.id)}" ${l.id === activeListId ? 'selected' : ''}>${escapeHtml(l.name)} (${l.students.length} Öğrenci)</option>`)
    .join('');

  const academicYears = ['2023-2024', '2024-2025', '2025-2026', '2026-2027', '2027-2028'];
  const currentYear = state.grades.academicYear || '2025-2026';
  const yearOptions = academicYears
    .map((y) => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`)
    .join('');

  const activeList = lists.find((l) => l.id === activeListId);
  const classCourses = activeList?.courses || (activeListId ? getClassCourses(activeListId) : []);
  const selectedCourse = state.grades.courseName || (classCourses[0] || 'Genel');

  let courseFieldHtml = '';
  if (classCourses.length > 0) {
    const courseOpts = classCourses
      .map((c) => `<option value="${escapeHtml(c)}" ${selectedCourse === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
      .join('');
    courseFieldHtml = `<select id="gradeCourseSelect" style="width:100%;min-height:38px;padding:6px 8px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
      ${courseOpts}
    </select>`;
  } else {
    courseFieldHtml = `<select id="gradeCourseSelect" style="width:100%;min-height:38px;padding:6px 8px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem">
      <option value="Genel">Genel</option>
    </select>`;
  }

  const editing = isGradesEditing();
  const headerActionHtml = editing
    ? `
      <div style="display:inline-flex;gap:6px;align-items:center">
        <button type="button" class="btn small secondary" data-action="cancel-grades-edit" title="Vazgeç" aria-label="Vazgeç" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <button type="button" class="btn small" data-action="save-grades" title="Kaydet" aria-label="Kaydet" style="background:#22c55e;color:#090909;border-color:#16a34a;display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px">
          <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><path d="M5 12l4 4L19 6"/></svg>
        </button>
      </div>
    `
    : `
      <button type="button" class="btn small secondary" data-action="start-grades-edit" title="Düzenle" aria-label="Düzenle" style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px">
        <svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    `;

  page.innerHTML = `
    <div class="stack">
      <div style="display:flex;align-items:center;justify-content:flex-end;margin-bottom:4px">
        ${headerActionHtml}
      </div>

      <div class="card" style="padding:10px;display:flex;flex-direction:column;gap:8px">
        <!-- Satır 1: Sınıf ve Ders Seçimi (Ferah alan) -->
        <div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1.7;min-width:0">
            <select id="gradeClassSelect" style="width:100%;min-height:38px;padding:6px 8px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-weight:700;text-overflow:ellipsis">
              ${classSelectOptions || '<option value="">Henüz sınıf yok</option>'}
            </select>
          </div>
          <div style="flex:1;min-width:0">
            ${courseFieldHtml}
          </div>
        </div>

        <!-- Satır 2: Yıl, Dönem ve Sınav (3 Eşit ve Simetrik Sütun) -->
        <div style="display:flex;gap:8px;align-items:center">
          <div style="flex:1;min-width:0">
            <select id="gradeYearSelect" style="width:100%;min-height:38px;padding:6px 6px;border-radius:8px;background:var(--surface2);color:inherit;border:1px solid var(--line2);font-size:0.85rem;text-align:center">
              ${yearOptions}
            </select>
          </div>
          <button type="button" class="btn small secondary" data-action="cycle-grade-term"
            title="Dönemi Değiştir (Tıkla)"
            style="flex:1;min-height:38px;padding:6px 4px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;white-space:nowrap">
            <span class="tiny muted" style="font-weight:700">DÖNEM:</span>
            <span style="color:var(--text);font-weight:900;font-size:0.95rem">${state.grades.term}</span>
          </button>
          <button type="button" class="btn small secondary" data-action="cycle-grade-exam"
            title="Sınavı Değiştir (Tıkla)"
            style="flex:1;min-height:38px;padding:6px 4px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;white-space:nowrap">
            <span class="tiny muted" style="font-weight:700">SINAV:</span>
            <span style="color:var(--text);font-weight:900;font-size:0.95rem">${state.grades.exam}</span>
          </button>
        </div>
      </div>

      <div class="card" style="padding:10px 14px">
        <div id="gradesStudentContainer">
          <p class="muted tiny">Yükleniyor...</p>
        </div>
      </div>
    </div>
  `;

  const classSel = $('gradeClassSelect') as HTMLSelectElement | null;
  if (classSel) {
    classSel.addEventListener('change', () => {
      setGradesEditing(false);
      context.setState({ grades: { activeListId: classSel.value } });
      renderGradesView(context);
    });
  }

  const courseSel = $('gradeCourseSelect') as HTMLSelectElement | null;
  if (courseSel) {
    courseSel.addEventListener('change', () => {
      setGradesEditing(false);
      context.setState({ grades: { courseName: courseSel.value } });
      loadClassGrades(context, () => renderGradesStudentList(context));
    });
  }

  const yearSel = $('gradeYearSelect') as HTMLSelectElement | null;
  if (yearSel) {
    yearSel.addEventListener('change', () => {
      setGradesEditing(false);
      context.setState({ grades: { academicYear: yearSel.value } });
      loadClassGrades(context, () => renderGradesStudentList(context));
    });
  }

  renderGradesStudentList(context);
  loadClassGrades(context, () => renderGradesStudentList(context));
}

/**
 * Handles grades & kanaat actions from event delegation.
 */
export async function handleGradesAction(
  action: string,
  dataset: DOMStringMap,
  context: FeatureContext
): Promise<boolean> {
  return handleGradesActionInternal(
    action,
    dataset,
    context,
    () => renderGradesView(context),
    () => renderGradesStudentList(context)
  );
}
