/**
 * Unit Tests for School Pool Selector
 * Vibecoding-Safe Native DOM Architecture
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAvailableClassLabels,
  togglePoolStudent,
  addFilteredPoolStudents,
  clearStagedPoolStudents
} from '../../src/features/lists/pool-selector';
import {
  getImportedStudents,
  setImportedStudents
} from '../../src/features/lists/import-roster';
import type { FeatureContext, MasterStudent, AppState } from '../../src/data/models/types';

describe('Pool Selector Unit Tests', () => {
  beforeEach(() => {
    setImportedStudents([]);
  });

  it('extracts unique class labels properly', () => {
    const mockPool: MasterStudent[] = [
      { id: '1', firstName: 'Ahmet', lastName: 'Yılmaz', classLabel: '10-A, 11-B' },
      { id: '2', firstName: 'Mehmet', lastName: 'Kaya', classLabel: '10-A' },
      { id: '3', firstName: 'Ayşe', lastName: 'Demir', classLabel: '9-C' }
    ];

    const labels = getAvailableClassLabels(mockPool);
    expect(labels).toEqual(['10-A', '11-B', '9-C'].sort((a, b) => a.localeCompare(b, 'tr')));
  });

  it('toggles student into and out of staged list', () => {
    expect(getImportedStudents().length).toBe(0);

    togglePoolStudent({ first: 'Ali', last: 'Veli', tc: '12345678901' });
    expect(getImportedStudents().length).toBe(1);
    expect(getImportedStudents()[0]?.firstName).toBe('Ali');

    // Toggling again should remove
    togglePoolStudent({ first: 'Ali', last: 'Veli' });
    expect(getImportedStudents().length).toBe(0);
  });

  it('clears staged pool students completely', () => {
    togglePoolStudent({ first: 'Ali', last: 'Veli' });
    togglePoolStudent({ first: 'Ayşe', last: 'Yıldız' });
    expect(getImportedStudents().length).toBe(2);

    clearStagedPoolStudents();
    expect(getImportedStudents().length).toBe(0);
  });

  it('adds filtered students to staged list without duplicates', () => {
    const mockState: AppState = {
      session: { role: 'admin', displayName: 'Admin', token: 'tok', teacherPin: null, teacherPinDate: null, pinRevealed: false },
      navigation: { currentTab: 'new', showArchived: false },
      attendance: { active: null, isSaving: false },
      history: { records: [], groupingMode: 'day', groupIndex: {}, sessionDetailsCache: {}, stagedDrafts: {}, activeEditModes: {}, undoTokens: {} },
      roster: {
        lists: [],
        masterPool: [
          { id: '1', firstName: 'Can', lastName: 'Yücel', classLabel: '10-A' },
          { id: '2', firstName: 'Cem', lastName: 'Karaca', classLabel: '10-A' }
        ],
        editingListId: null,
        isLoading: false
      },
      grades: { activeListId: null, academicYear: '2024-2025', term: 1, exam: 1, courseName: '', entries: {}, isSubmitting: false }
    };

    const mockContext: FeatureContext = {
      getState: () => mockState,
      setState: () => {},
      navigate: () => {},
      refresh: async () => {},
      updateTopBar: () => {}
    };

    addFilteredPoolStudents(mockContext);
    expect(getImportedStudents().length).toBe(2);

    // Calling it again should not duplicate students
    addFilteredPoolStudents(mockContext);
    expect(getImportedStudents().length).toBe(2);
  });
});
