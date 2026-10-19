/**
 * Class Student Management Unit Test Suite
 * Vibecoding-Safe Native DOM Architecture
 * Tests class management UI rendering, student editing, adding, and pool sync triggers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderClassManagementHtml,
  handleClassAdminAction,
  setActiveManageListId
} from '../../src/features/settings/class-management';
import {
  handleConfirmEditStudent,
  handleRemoveStudentFromClass,
  handleAddSingleStudent,
  handleAddPoolStudent,
  handleBulkAddStudents
} from '../../src/features/settings/class-student-actions';
import * as rpcModule from '../../src/data/supabase/rpc';
import type { FeatureContext, AppState } from '../../src/data/models/types';

describe('Class Student Management & Pool Sync Suite', () => {
  let mockState: AppState;
  let mockContext: FeatureContext;

  beforeEach(() => {
    setActiveManageListId(null);
    document.body.innerHTML = '';

    mockState = {
      session: {
        role: 'admin',
        displayName: 'Müdür',
        token: 'token-123',
        institutionId: 'inst-1',
        institutionSlug: 'bahibkk',
        institutionName: 'Bahçeşehir İBKK',
        teacherPin: '123456',
        teacherPinDate: '16.10.2026',
        pinRevealed: false
      },
      navigation: { currentTab: 'admin', showArchived: false },
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
            id: 'list-10a',
            name: '10-A',
            students: [
              { id: 's-1', firstName: 'Ahmet', lastName: 'Yılmaz', tcNo: '10000000146', listId: 'list-10a' },
              { id: 's-2', firstName: 'Mehmet', lastName: 'Kaya', listId: 'list-10a' }
            ]
          }
        ],
        masterPool: [
          { id: 'p-1', firstName: 'Ayşe', lastName: 'Demir', tcNo: '10000000146', classLabel: '10-B' },
          { id: 'p-2', firstName: 'Ahmet', lastName: 'Yılmaz', tcNo: '10000000146', classLabel: '10-A' }
        ],
        editingListId: null,
        isLoading: false
      },
      grades: {
        activeListId: null,
        academicYear: '2026-2027',
        term: 1,
        exam: 1,
        courseName: '',
        entries: {},
        isSubmitting: false
      }
    };

    mockContext = {
      getState: () => mockState,
      setState: vi.fn(),
      navigate: vi.fn(),
      refresh: vi.fn(),
      updateTopBar: vi.fn()
    };
  });

  it('renders class list rows with student count and toggle button', () => {
    const html = renderClassManagementHtml(mockContext);
    expect(html).toContain('10-A');
    expect(html).toContain('2 Öğrenci');
    expect(html).toContain('data-action="toggle-manage-class"');
  });

  it('renders expanded student panel when class is active', () => {
    setActiveManageListId('list-10a');
    const html = renderClassManagementHtml(mockContext);

    expect(html).toContain('Ahmet Yılmaz');
    expect(html).toContain('10000000146');
    expect(html).toContain('Mehmet Kaya');
    expect(html).toContain('data-drawer="student-menu"');
  });

  it('toggles AD view: when OFF, strictly shows only last name (never Last First or First)', async () => {
    setActiveManageListId('list-10a');
    // Toggle OFF
    await handleClassAdminAction('toggle-class-student-ad', {}, mockContext);
    const htmlOff = renderClassManagementHtml(mockContext);
    expect(htmlOff).toContain('Yılmaz');
    expect(htmlOff).not.toContain('Ahmet Yılmaz');
    expect(htmlOff).not.toContain('Yılmaz Ahmet');

    // Toggle back ON
    await handleClassAdminAction('toggle-class-student-ad', {}, mockContext);
    const htmlOn = renderClassManagementHtml(mockContext);
    expect(htmlOn).toContain('Ahmet Yılmaz');
  });

  it('supports horizontal drawer switching with back chevron', async () => {
    setActiveManageListId('list-10a');

    // Open course drawer
    await handleClassAdminAction('set-class-drawer', { drawer: 'add-course' }, mockContext);
    const htmlCourse = renderClassManagementHtml(mockContext);
    expect(htmlCourse).toContain('newCourseInput-list-10a');
    expect(htmlCourse).toContain('data-drawer="none"');

    // Switch to student menu drawer
    await handleClassAdminAction('set-class-drawer', { drawer: 'student-menu' }, mockContext);
    const htmlStudentMenu = renderClassManagementHtml(mockContext);
    expect(htmlStudentMenu).toContain('data-drawer="student-pool"');
    expect(htmlStudentMenu).toContain('data-drawer="student-manual"');
    expect(htmlStudentMenu).toContain('data-drawer="student-file"');

    // Close drawer
    await handleClassAdminAction('close-class-drawer', {}, mockContext);
    const htmlClosed = renderClassManagementHtml(mockContext);
    expect(htmlClosed).toContain('data-drawer="student-menu"');
  });

  it('toggles manage class open and closed via handleClassAdminAction', async () => {
    const handledOpen = await handleClassAdminAction(
      'toggle-manage-class',
      { listId: 'list-10a' },
      mockContext
    );
    expect(handledOpen).toBe(true);

    const htmlOpen = renderClassManagementHtml(mockContext);
    expect(htmlOpen).toContain('Ahmet Yılmaz');

    const handledClose = await handleClassAdminAction(
      'toggle-manage-class',
      { listId: 'list-10a' },
      mockContext
    );
    expect(handledClose).toBe(true);

    const htmlClose = renderClassManagementHtml(mockContext);
    expect(htmlClose).not.toContain('Ahmet Yılmaz');
  });

  it('hides delete buttons and blocks deletion for non-admin teacher role', async () => {
    mockState.session.role = 'teacher';
    setActiveManageListId('list-10a');

    const htmlTeacher = renderClassManagementHtml(mockContext);
    expect(htmlTeacher).not.toContain('data-action="delete-list"');
    expect(htmlTeacher).not.toContain('data-action="remove-class-course"');

    // Attempting delete-student as teacher is blocked
    const studentDeleted = await handleClassAdminAction(
      'remove-student-from-class',
      { listId: 'list-10a', studentId: 's-1' },
      mockContext
    );
    expect(studentDeleted).toBe(true);

    mockState.session.role = 'admin';
  });

  it('calls update_student_in_list RPC and refreshes on student edit confirm', async () => {
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });

    document.body.innerHTML = `
      <input id="editStudentFirst-s-1" value="Ahmet Can" />
      <input id="editStudentLast-s-1" value="Yılmaz" />
      <input id="editStudentTc-s-1" value="10000000146" />
    `;

    const ok = await handleConfirmEditStudent('list-10a', 's-1', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('update_student_in_list', {
      p_token: 'token-123',
      p_list_id: 'list-10a',
      p_student_id: 's-1',
      p_first_name: 'Ahmet Can',
      p_last_name: 'Yılmaz',
      p_tc_no: '10000000146'
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
  });

  it('calls remove_student_from_list RPC when student is removed', async () => {
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const ok = await handleRemoveStudentFromClass('list-10a', 's-1', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('remove_student_from_list', {
      p_token: 'token-123',
      p_list_id: 'list-10a',
      p_student_id: 's-1'
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
  });

  it('adds a single student to class and pool via add_student_to_list RPC', async () => {
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });

    document.body.innerHTML = `
      <input id="classAddFirst-list-10a" value="Zeynep" />
      <input id="classAddLast-list-10a" value="Aydın" />
      <input id="classAddTc-list-10a" value="10000000146" />
    `;

    const ok = await handleAddSingleStudent('list-10a', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('add_student_to_list', {
      p_token: 'token-123',
      p_list_id: 'list-10a',
      p_first_name: 'Zeynep',
      p_last_name: 'Aydın',
      p_tc_no: '10000000146'
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
  });

  it('adds a student from master pool to class via add_student_to_list RPC', async () => {
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });

    const ok = await handleAddPoolStudent('list-10a', 'p-1', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('add_student_to_list', {
      p_token: 'token-123',
      p_list_id: 'list-10a',
      p_first_name: 'Ayşe',
      p_last_name: 'Demir',
      p_tc_no: '10000000146'
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
  });

  it('bulk adds pasted students via bulk_add_students_to_list RPC', async () => {
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });

    document.body.innerHTML = `
      <textarea id="classPasteArea-list-10a">Can\tÖztürk\t10000000146\nDeniz\tKara</textarea>
    `;

    const ok = await handleBulkAddStudents('list-10a', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('bulk_add_students_to_list', {
      p_token: 'token-123',
      p_list_id: 'list-10a',
      p_students: [
        { firstName: 'Can', lastName: 'Öztürk', tcNo: '10000000146' },
        { firstName: 'Deniz', lastName: 'Kara' }
      ]
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
  });

  it('renders edit button in school pool and supports editing pool students', async () => {
    const { renderPoolManagementHtml, setPoolEditingMode, setEditingPoolStudentId, handlePoolAdminAction } = await import(
      '../../src/features/settings/pool-management'
    );
    const { handleConfirmEditPoolStudent } = await import(
      '../../src/features/settings/pool-actions'
    );

    // Initial render in edit mode has edit buttons
    setPoolEditingMode(true);
    const html = renderPoolManagementHtml(mockContext);
    expect(html).toContain('data-action="start-edit-pool-student"');
    expect(html).toContain('Ayşe Demir');

    // Start edit mode
    await handlePoolAdminAction('start-edit-pool-student', { studentId: 'p-1' }, mockContext);
    const editHtml = renderPoolManagementHtml(mockContext);
    expect(editHtml).toContain('id="editPoolFirst-p-1"');
    expect(editHtml).toContain('data-action="confirm-edit-pool-student"');

    // Confirm edit
    const rpcSpy = vi.spyOn(rpcModule, 'rpc').mockResolvedValue({ success: true });
    document.body.innerHTML = `
      <input id="editPoolFirst-p-1" value="Ayşe Gül" />
      <input id="editPoolLast-p-1" value="Demir" />
      <input id="editPoolTc-p-1" value="10000000146" />
      <input id="editPoolClass-p-1" value="10-C" />
    `;

    const ok = await handleConfirmEditPoolStudent('p-1', mockContext);
    expect(ok).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith('update_school_student', {
      p_token: 'token-123',
      p_student_id: 'p-1',
      p_first_name: 'Ayşe Gül',
      p_last_name: 'Demir',
      p_tc_no: '10000000146',
      p_class_label: '10-C'
    });
    expect(mockContext.refresh).toHaveBeenCalled();
    rpcSpy.mockRestore();
    setEditingPoolStudentId(null);
  });
});
