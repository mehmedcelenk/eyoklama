/**
 * Teacher Grades & Kanaat Management Actions
 * Vibecoding-Safe Native DOM Architecture
 * Features Layer (Layer 2) - RPC calls, edit mode state, and action delegation
 */

import { rpc } from '../../data/supabase/rpc';
import type { FeatureContext, GradeEntry } from '../../data/models/types';
import { toast } from '../../shared/toast';

let isEditing = false;

export function isGradesEditing(): boolean {
  return isEditing;
}

export function setGradesEditing(editing: boolean): void {
  isEditing = editing;
}

const $ = (id: string): HTMLElement | null =>
  typeof document !== 'undefined' ? document.getElementById(id) : null;

/**
 * Loads grades for the active class, year, term, and exam slot.
 */
export async function loadClassGrades(
  context: FeatureContext,
  onLoaded?: () => void
): Promise<void> {
  const state = context.getState();
  if (!state.grades.activeListId || !state.session.token) return;

  try {
    const grades = await rpc('get_class_grades', {
      p_token: state.session.token,
      p_list_id: state.grades.activeListId,
      p_course_name: state.grades.courseName || 'Genel',
      p_academic_year: state.grades.academicYear,
      p_term: state.grades.term,
      p_exam: state.grades.exam
    });

    context.setState({ grades: { entries: grades || {} } });
    if (onLoaded) {
      onLoaded();
    }
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.warn('[Grades] Could not load grades:', e.message);
  }
}

/**
 * Saves current grades and opinions for all students in the class.
 * Returns true if successful, false otherwise.
 */
export async function saveClassGrades(context: FeatureContext): Promise<boolean> {
  const state = context.getState();
  if (!state.grades.activeListId || !state.session.token) {
    toast('Oturum veya sınıf bulunamadı.');
    return false;
  }

  const courseSel = $('gradeCourseSelect') as HTMLSelectElement | null;
  const courseName = courseSel?.value || state.grades.courseName || 'Genel';

  const yearSel = $('gradeYearSelect') as HTMLSelectElement | null;
  const academicYear = yearSel?.value || state.grades.academicYear || '2025-2026';

  const list = state.roster.lists.find((l) => l.id === state.grades.activeListId);
  if (!list) {
    toast('Sınıf bulunamadı.');
    return false;
  }

  const entries: GradeEntry[] = [];
  const localEntries: Record<string, { grade: string; opinion: string }> = { ...state.grades.entries };
  const gradeInputs = document.querySelectorAll<HTMLInputElement>('.student-grade-input');
  const opinionInputs = document.querySelectorAll<HTMLInputElement>('.student-opinion-input');

  const gradeMap: Record<string, string> = {};
  gradeInputs.forEach((inp) => {
    const tc = inp.getAttribute('data-tc');
    if (tc) gradeMap[tc] = inp.value.trim();
  });

  const opinionMap: Record<string, string> = {};
  opinionInputs.forEach((inp) => {
    const tc = inp.getAttribute('data-tc');
    if (tc) opinionMap[tc] = inp.value.trim();
  });

  for (const s of list.students) {
    const tc = s.tcNo || s.id || '';
    if (!tc) continue;
    const grade = gradeMap[tc] ?? '';
    const opinion = opinionMap[tc] ?? '';
    localEntries[tc] = { grade, opinion };
    if (grade !== '' || opinion !== '') {
      entries.push({ tc, grade, opinion });
    }
  }

  context.setState({ grades: { entries: localEntries, courseName, academicYear } });

  try {
    await rpc('save_grades_batch', {
      p_token: state.session.token,
      p_list_id: state.grades.activeListId,
      p_course_name: courseName,
      p_academic_year: academicYear,
      p_term: state.grades.term,
      p_exam: state.grades.exam,
      p_entries: entries
    });

    toast('Notlar ve kanaatler kaydedildi.');
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    toast(e.message || 'Notlar kaydedilemedi.');
    return false;
  }
}

/**
 * Handles grades & kanaat actions from event delegation.
 */
export async function handleGradesAction(
  action: string,
  dataset: DOMStringMap,
  context: FeatureContext,
  renderView: () => void,
  renderList: () => void
): Promise<boolean> {
  if (action === 'open-grades' && dataset.listId) {
    setGradesEditing(false);
    const list = context.getState().roster.lists.find((l) => l.id === dataset.listId);
    context.setState({
      grades: {
        activeListId: dataset.listId,
        courseName: list?.name || '',
        entries: {}
      }
    });
    context.navigate('grades');
    return true;
  }

  if (action === 'cycle-grade-term') {
    setGradesEditing(false);
    const cur = context.getState().grades.term || 1;
    const nextTerm = cur === 1 ? 2 : 1;
    context.setState({ grades: { term: nextTerm } });
    renderView();
    return true;
  }

  if (action === 'cycle-grade-exam') {
    setGradesEditing(false);
    const cur = context.getState().grades.exam || 1;
    const nextExam = (cur % 4) + 1;
    context.setState({ grades: { exam: nextExam } });
    renderView();
    return true;
  }

  if (action === 'select-grade-term' && dataset.term) {
    setGradesEditing(false);
    context.setState({ grades: { term: parseInt(dataset.term, 10) } });
    renderView();
    return true;
  }

  if (action === 'select-grade-exam' && dataset.exam) {
    setGradesEditing(false);
    context.setState({ grades: { exam: parseInt(dataset.exam, 10) } });
    renderView();
    return true;
  }

  if (action === 'start-grades-edit') {
    setGradesEditing(true);
    renderView();
    return true;
  }

  if (action === 'cancel-grades-edit') {
    setGradesEditing(false);
    renderView();
    return true;
  }

  if (action === 'save-grades') {
    const ok = await saveClassGrades(context);
    if (ok) {
      setGradesEditing(false);
      await loadClassGrades(context, renderList);
      renderView();
    }
    return true;
  }

  return false;
}

