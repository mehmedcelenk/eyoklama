/**
 * Pool Management View Mode vs Edit/Add Mode Unit Tests
 * Vibecoding-Safe Native DOM Architecture
 * Tests Pure Preview Mode, Add Mode (file/manual), Edit Mode (edit/delete actions), and action handlers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderPoolManagementHtml,
  handlePoolAdminAction,
  isPoolAddingMode,
  setPoolAddingMode,
  isPoolEditingMode,
  setPoolEditingMode,
  getEditingPoolStudentId,
  setEditingPoolStudentId,
  setupPoolManagementListeners
} from '../../src/features/settings/pool-management';
import {
  setActiveSettingsTab,
  getActiveSettingsTab
} from '../../src/features/settings/settings-view';
import type { FeatureContext, AppState } from '../../src/data/models/types';

describe('Pool Management View Mode Suite', () => {
  let mockState: AppState;
  let mockContext: FeatureContext;

  beforeEach(() => {
    setPoolAddingMode(false);
    setPoolEditingMode(false);
    setEditingPoolStudentId(null);
    document.body.innerHTML = '<div id="adminPage"></div>';

    mockState = {
      session: {
        role: 'admin',
        displayName: 'Yönetici',
        token: 'token-admin-1',
        institutionId: 'inst-1',
        institutionSlug: 'test-okul',
        institutionName: 'Test Okulu',
        teacherPin: '123456',
        teacherPinDate: '17.10.2026',
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
        lists: [],
        masterPool: [
          { id: 'pool-1', firstName: 'Ahmet', lastName: 'Yılmaz', tcNo: '10000000146', classLabel: '10-A' },
          { id: 'pool-2', firstName: 'Ayşe', lastName: 'Demir', classLabel: '11-B' }
        ],
        editingListId: null,
        isLoading: false
      },
      grades: {
        activeListId: null,
        academicYear: '2025-2026',
        term: 1,
        exam: 1,
        courseName: 'Genel',
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

  it('defaults to Pure Preview Mode: clean list without edit/delete buttons or add forms', () => {
    expect(isPoolAddingMode()).toBe(false);
    expect(isPoolEditingMode()).toBe(false);

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    // Ekle and Düzenle buttons should be present in the header
    expect(container.querySelector('[data-action="start-pool-add"]')).not.toBeNull();
    expect(container.querySelector('[data-action="start-pool-edit"]')).not.toBeNull();

    // Add forms must NOT be present
    expect(container.querySelector('#poolPasteArea')).toBeNull();
    expect(container.querySelector('#poolFileInput')).toBeNull();
    expect(container.querySelector('#poolAddFirst')).toBeNull();

    // Student items rendered cleanly with info
    expect(container.textContent).toContain('Ahmet Yılmaz');
    expect(container.textContent).toContain('10-A');
    expect(container.textContent).toContain('10000000146');
    expect(container.textContent).toContain('Ayşe Demir');
    expect(container.textContent).toContain('11-B');

    // In Pure Preview Mode, NO edit or delete buttons on rows
    expect(container.querySelectorAll('[data-action="start-edit-pool-student"]').length).toBe(0);
    expect(container.querySelectorAll('[data-action="delete-pool-student"]').length).toBe(0);
  });

  it('switches to Add Mode when start-pool-add is clicked, revealing file and manual inputs', async () => {
    const handled = await handlePoolAdminAction('start-pool-add', {}, mockContext);
    expect(handled).toBe(true);
    expect(isPoolAddingMode()).toBe(true);
    expect(isPoolEditingMode()).toBe(false);

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    // Header now has Vazgeç button for adding
    expect(container.querySelector('[data-action="cancel-pool-add"]')).not.toBeNull();

    // File upload and manual addition fields are now visible
    expect(container.querySelector('#poolFileInput')).not.toBeNull();
    // Paste area should be cancelled/removed as requested
    expect(container.querySelector('#poolPasteArea')).toBeNull();
    expect(container.querySelector('#poolAddFirst')).not.toBeNull();
    expect(container.querySelector('#poolAddLast')).not.toBeNull();
    expect(container.querySelector('#poolAddTc')).not.toBeNull();

    // Sınıf field should be a select dropdown with existing class options
    const classSelect = container.querySelector<HTMLSelectElement>('#poolAddClass');
    expect(classSelect).not.toBeNull();
    expect(classSelect?.tagName.toLowerCase()).toBe('select');
    expect(classSelect?.innerHTML).toContain('10-A');
    expect(classSelect?.innerHTML).toContain('11-B');
  });

  it('cancels Add Mode and restores Pure Preview on cancel-pool-add', async () => {
    setPoolAddingMode(true);
    expect(isPoolAddingMode()).toBe(true);

    const handled = await handlePoolAdminAction('cancel-pool-add', {}, mockContext);
    expect(handled).toBe(true);
    expect(isPoolAddingMode()).toBe(false);

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    expect(container.querySelector('#poolPasteArea')).toBeNull();
    expect(container.querySelector('#poolFileInput')).toBeNull();
    expect(container.querySelector('[data-action="start-pool-add"]')).not.toBeNull();
  });

  it('switches to Edit Mode when start-pool-edit is clicked, showing edit and delete options on rows', async () => {
    const handled = await handlePoolAdminAction('start-pool-edit', {}, mockContext);
    expect(handled).toBe(true);
    expect(isPoolEditingMode()).toBe(true);
    expect(isPoolAddingMode()).toBe(false);

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    // Tamam button should replace Düzenle button
    expect(container.querySelector('[data-action="stop-pool-edit"]')).not.toBeNull();
    expect(container.querySelector('[data-action="start-pool-edit"]')).toBeNull();

    // Edit and delete buttons should now be rendered for each student
    const editBtns = container.querySelectorAll('[data-action="start-edit-pool-student"]');
    const deleteBtns = container.querySelectorAll('[data-action="delete-pool-student"]');
    expect(editBtns.length).toBe(2);
    expect(deleteBtns.length).toBe(2);
  });

  it('exits Edit Mode and restores Pure Preview on stop-pool-edit', async () => {
    setPoolEditingMode(true);
    setEditingPoolStudentId('pool-1');

    const handled = await handlePoolAdminAction('stop-pool-edit', {}, mockContext);
    expect(handled).toBe(true);
    expect(isPoolEditingMode()).toBe(false);
    expect(getEditingPoolStudentId()).toBeNull();

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    expect(container.querySelectorAll('[data-action="start-edit-pool-student"]').length).toBe(0);
    expect(container.querySelectorAll('[data-action="delete-pool-student"]').length).toBe(0);
    expect(container.querySelector('[data-action="start-pool-edit"]')).not.toBeNull();
  });

  it('renders inline editing inputs when a student is selected for edit', async () => {
    setPoolEditingMode(true);
    const handled = await handlePoolAdminAction('start-edit-pool-student', { studentId: 'pool-1' }, mockContext);
    expect(handled).toBe(true);
    expect(getEditingPoolStudentId()).toBe('pool-1');

    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    // Inline edit row should be rendered for pool-1
    expect(container.querySelector('#editPoolFirst-pool-1')).not.toBeNull();
    expect(container.querySelector('#editPoolLast-pool-1')).not.toBeNull();
    expect(container.querySelector('[data-action="confirm-edit-pool-student"]')).not.toBeNull();
    expect(container.querySelector('[data-action="cancel-edit-pool-student"]')).not.toBeNull();
  });

  it('resets pool add and edit modes when switching tabs away from pool', () => {
    setPoolAddingMode(true);
    setPoolEditingMode(true);

    setActiveSettingsTab('classes');
    expect(getActiveSettingsTab()).toBe('classes');
    expect(isPoolAddingMode()).toBe(false);
    expect(isPoolEditingMode()).toBe(false);
  });

  it('supports search input filtering without breaking layout', () => {
    const html = renderPoolManagementHtml(mockContext);
    const container = document.getElementById('adminPage')!;
    container.innerHTML = html;

    setupPoolManagementListeners(mockContext);
    const searchInput = container.querySelector<HTMLInputElement>('#poolAdminSearchInput')!;
    expect(searchInput).not.toBeNull();

    searchInput.value = 'Ahmet';
    searchInput.dispatchEvent(new Event('input'));

    const listEl = container.querySelector('#poolAdminList')!;
    expect(listEl.textContent).toContain('Ahmet Yılmaz');
    expect(listEl.textContent).not.toContain('Ayşe Demir');
  });
});
