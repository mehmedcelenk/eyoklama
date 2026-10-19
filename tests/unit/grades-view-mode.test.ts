/**
 * Grades View Mode vs Edit Mode Unit Tests
 * Vibecoding-Safe Native DOM Architecture
 * Tests View Mode (clean badges/text) vs Edit Mode (interactive inputs) and action toggles.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderGradesView,
  handleGradesAction
} from '../../src/features/grades/grades-view';
import {
  isGradesEditing,
  setGradesEditing
} from '../../src/features/grades/grades-actions';
import type { FeatureContext, AppState } from '../../src/data/models/types';

vi.mock('../../src/data/supabase/rpc', () => ({
  rpc: vi.fn().mockImplementation((name: string) => {
    if (name === 'get_class_grades') {
      return Promise.resolve({
        '10000000146': { grade: '95', opinion: 'Çok başarılı ve gayretli' }
      });
    }
    return Promise.resolve(null);
  })
}));

describe('Grades View Mode vs Edit Mode Suite', () => {
  let mockState: AppState;
  let mockContext: FeatureContext;

  beforeEach(() => {
    setGradesEditing(false);
    document.body.innerHTML = `
      <div id="gradesPage"></div>
      <div id="gradesStudentContainer"></div>
    `;

    mockState = {
      session: {
        role: 'teacher',
        displayName: 'Ali Öğretmen',
        token: 'token-teacher-1',
        institutionId: 'inst-1',
        institutionSlug: 'test-okul',
        institutionName: 'Test Okulu',
        teacherPin: '123456',
        teacherPinDate: '16.10.2026',
        pinRevealed: false
      },
      navigation: { currentTab: 'grades', showArchived: false },
      attendance: { active: null, isSaving: false },
      history: {
        records: [],
        groupingMode: 'day',
        groupIndex: {},
        sessionDetailsCache: {},
        stagedDrafts: {},
        activeEditModes: {},
        undoTokens: {}
      },
      roster: {
        lists: [
          {
            id: 'list-1',
            name: '9-A',
            students: [
              { id: 's-1', firstName: 'Mehmet', lastName: 'Demir', tcNo: '10000000146', listId: 'list-1' },
              { id: 's-2', firstName: 'Ayşe', lastName: 'Kaya', tcNo: '20000000146', listId: 'list-1' }
            ]
          }
        ],
        masterPool: [],
        editingListId: null,
        isLoading: false
      },
      grades: {
        activeListId: 'list-1',
        academicYear: '2025-2026',
        term: 1,
        exam: 1,
        courseName: 'Genel',
        entries: {
          '10000000146': { grade: '95', opinion: 'Çok başarılı ve gayretli' }
        },
        isSubmitting: false
      }
    };

    mockContext = {
      getState: () => mockState,
      setState: (updater) => {
        const partial = typeof updater === 'function' ? updater(mockState) : updater;
        if (partial.grades) {
          mockState.grades = { ...mockState.grades, ...partial.grades };
        }
      },
      navigate: vi.fn(),
      refresh: vi.fn(),
      updateTopBar: vi.fn()
    };
  });

  it('defaults to View Mode with no inputs rendered', () => {
    expect(isGradesEditing()).toBe(false);
    renderGradesView(mockContext);

    // In View Mode, Düzenle button should be present
    const editBtn = document.querySelector('[data-action="start-grades-edit"]');
    expect(editBtn).not.toBeNull();
    expect(editBtn?.getAttribute('title')).toBe('Düzenle');

    // No input elements should exist in the student container
    const gradeInputs = document.querySelectorAll('.student-grade-input');
    const opinionInputs = document.querySelectorAll('.student-opinion-input');
    expect(gradeInputs.length).toBe(0);
    expect(opinionInputs.length).toBe(0);

    // Text content should display existing grade and opinion
    const studentContainer = document.getElementById('gradesStudentContainer');
    expect(studentContainer?.textContent).toContain('Mehmet Demir');
    expect(studentContainer?.textContent).toContain('95');
    expect(studentContainer?.textContent).toContain('Çok başarılı ve gayretli');
    // Student with no grade should show empty state
    expect(studentContainer?.textContent).toContain('Kanaat belirtilmemiş');
  });

  it('switches to Edit Mode when start-grades-edit action is triggered', async () => {
    renderGradesView(mockContext);

    const handled = await handleGradesAction('start-grades-edit', {}, mockContext);
    expect(handled).toBe(true);
    expect(isGradesEditing()).toBe(true);

    // In Edit Mode, Save and Cancel buttons should be present
    expect(document.querySelector('[data-action="save-grades"]')).not.toBeNull();
    expect(document.querySelector('[data-action="cancel-grades-edit"]')).not.toBeNull();
    expect(document.querySelector('[data-action="start-grades-edit"]')).toBeNull();

    // Input fields should now be rendered for each student
    const gradeInputs = document.querySelectorAll<HTMLInputElement>('.student-grade-input');
    const opinionInputs = document.querySelectorAll<HTMLInputElement>('.student-opinion-input');
    expect(gradeInputs.length).toBe(2);
    expect(opinionInputs.length).toBe(2);
    expect(gradeInputs[0]?.value).toBe('95');
    expect(opinionInputs[0]?.value).toBe('Çok başarılı ve gayretli');
  });

  it('cancels Edit Mode and restores View Mode on cancel-grades-edit', async () => {
    setGradesEditing(true);
    renderGradesView(mockContext);

    expect(document.querySelectorAll('.student-grade-input').length).toBe(2);

    const handled = await handleGradesAction('cancel-grades-edit', {}, mockContext);
    expect(handled).toBe(true);
    expect(isGradesEditing()).toBe(false);

    expect(document.querySelectorAll('.student-grade-input').length).toBe(0);
    expect(document.querySelector('[data-action="start-grades-edit"]')).not.toBeNull();
  });

  it('resets edit mode to false when switching term or exam', async () => {
    setGradesEditing(true);
    expect(isGradesEditing()).toBe(true);

    await handleGradesAction('select-grade-term', { term: '2' }, mockContext);
    expect(mockState.grades.term).toBe(2);
    expect(isGradesEditing()).toBe(false);

    setGradesEditing(true);
    await handleGradesAction('select-grade-exam', { exam: '3' }, mockContext);
    expect(mockState.grades.exam).toBe(3);
    expect(isGradesEditing()).toBe(false);
  });

  it('cycles term between 1 and 2 on cycle-grade-term', async () => {
    mockState.grades.term = 1;
    await handleGradesAction('cycle-grade-term', {}, mockContext);
    expect(mockState.grades.term).toBe(2);

    await handleGradesAction('cycle-grade-term', {}, mockContext);
    expect(mockState.grades.term).toBe(1);
  });

  it('cycles exam through 1, 2, 3, 4, 1 on cycle-grade-exam', async () => {
    mockState.grades.exam = 1;
    await handleGradesAction('cycle-grade-exam', {}, mockContext);
    expect(mockState.grades.exam).toBe(2);

    await handleGradesAction('cycle-grade-exam', {}, mockContext);
    expect(mockState.grades.exam).toBe(3);

    await handleGradesAction('cycle-grade-exam', {}, mockContext);
    expect(mockState.grades.exam).toBe(4);

    await handleGradesAction('cycle-grade-exam', {}, mockContext);
    expect(mockState.grades.exam).toBe(1);
  });
});
