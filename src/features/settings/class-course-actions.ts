/**
 * Class Courses Management Actions Subsystem
 * Vibecoding-Safe Native DOM Architecture
 * Stores and manages courses (subjects) for a class in local state & storage.
 */

import type { FeatureContext } from '../../data/models/types';
import { toast } from '../../shared/toast';

const STORAGE_PREFIX = 'eyoklama_class_courses_';

export function getClassCourses(listId: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${listId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveClassCourses(listId: string, courses: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${listId}`, JSON.stringify(courses));
  } catch {
    // ignore
  }
}

export function addCourseToClass(listId: string, courseName: string, context: FeatureContext): boolean {
  const clean = courseName.trim();
  if (!clean) {
    toast('Ders adı boş olamaz.');
    return false;
  }

  const current = getClassCourses(listId);
  if (current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    toast('Bu ders zaten ekli.');
    return false;
  }

  const updated = [...current, clean];
  saveClassCourses(listId, updated);

  // Sync to store
  const state = context.getState();
  const lists = state.roster.lists.map((l) => (l.id === listId ? { ...l, courses: updated } : l));
  context.setState({ roster: { lists } });
  toast(`${clean} dersi sınıfa eklendi.`);
  return true;
}

export function removeCourseFromClass(listId: string, courseName: string, context: FeatureContext): boolean {
  if (
    typeof window !== 'undefined' &&
    !window.confirm(`"${courseName}" dersi sınıftan kaldırılsın mı?\n(Not ve karne geçmişi veritabanında korunur)`)
  ) {
    return false;
  }
  const current = getClassCourses(listId);
  const updated = current.filter((c) => c !== courseName);
  saveClassCourses(listId, updated);

  const state = context.getState();
  const lists = state.roster.lists.map((l) => (l.id === listId ? { ...l, courses: updated } : l));
  context.setState({ roster: { lists } });
  toast(`${courseName} dersi kaldırıldı.`);
  return true;
}
