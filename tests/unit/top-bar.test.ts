import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPageTitle, updateTopBar, initTopBarEvents } from '../../src/app/top-bar';
import type { AppState, FeatureContext } from '../../src/data/models/types';

describe('Top Bar Branding & Responsive Page Title', () => {
  let mockState: AppState;
  let mockContext: FeatureContext;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="topBrandBtn" class="top-nav-brand">
        <div id="topBrandLogo" class="login-mark small">
          <svg></svg>
        </div>
        <button id="topBackBtn" class="icon-btn ghost hidden">
          <svg></svg>
        </button>
        <span class="brand-title">Initial Brand</span>
      </div>
      <div id="topNavActions" class="top-nav-actions">
        <button id="topPermBtn"><span id="topPermBadge" class="hidden">0</span></button>
        <button id="topGradesBtn"></button>
        <button id="topAdminBtn" class="hidden"></button>
        <button id="topLogoutBtn"></button>
      </div>
    `;

    mockState = {
      session: {
        role: 'teacher',
        displayName: 'Test Öğretmen',
        token: 'token-123',
        institutionName: 'Kabataş Erkek Lisesi',
        teacherPin: null,
        teacherPinDate: null,
        pinRevealed: false
      },
      navigation: {
        currentTab: 'lists',
        showArchived: false
      },
      attendance: {
        active: null,
        isSaving: false
      },
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
        masterPool: [],
        editingListId: null,
        isLoading: false
      },
      grades: {
        activeListId: null,
        academicYear: '2024-2025',
        term: 1,
        exam: 1,
        courseName: 'Matematik',
        entries: {},
        isSubmitting: false
      }
    };

    mockContext = {
      getState: () => mockState,
      setState: vi.fn(),
      navigate: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      updateTopBar: vi.fn()
    };
  });

  describe('getPageTitle resolution', () => {
    it('returns institution name on the home page (lists)', () => {
      expect(getPageTitle('lists', mockState)).toBe('Kabataş Erkek Lisesi');
    });

    it('returns Ayarlar for admin tab', () => {
      expect(getPageTitle('admin', mockState)).toBe('Ayarlar');
    });

    it('returns Not & Kanaat for grades tab', () => {
      expect(getPageTitle('grades', mockState)).toBe('Not & Kanaat');
    });

    it('returns Sınıf / Ders Ekle for new tab', () => {
      expect(getPageTitle('new', mockState)).toBe('Sınıf / Ders Ekle');
    });

    it('returns Geçmiş Yoklamalar for history tab', () => {
      expect(getPageTitle('history', mockState)).toBe('Geçmiş Yoklamalar');
    });

    it('returns Yoklama or active list name for attendance tab', () => {
      expect(getPageTitle('attendance', mockState)).toBe('Yoklama');

      mockState.attendance.active = {
        mode: 'new',
        listId: 'list-1',
        listName: '10-A Fizik',
        students: [],
        statuses: {}
      };
      expect(getPageTitle('attendance', mockState)).toBe('10-A Fizik');
    });
  });

  describe('updateTopBar DOM behavior', () => {
    it('shows logo and institution name on the home page', () => {
      mockState.navigation.currentTab = 'lists';
      updateTopBar(mockContext);

      const logo = document.getElementById('topBrandLogo');
      const backBtn = document.getElementById('topBackBtn');
      const navActions = document.getElementById('topNavActions');
      const title = document.querySelector('.brand-title');
      const brandBtn = document.getElementById('topBrandBtn');

      expect(logo?.classList.contains('hidden')).toBe(false);
      expect(backBtn?.classList.contains('hidden')).toBe(true);
      expect(navActions?.classList.contains('hidden')).toBe(false);
      expect(title?.textContent).toBe('Kabataş Erkek Lisesi');
      expect(brandBtn?.getAttribute('title')).toBe('Ana Sayfa');
    });

    it('hides logo and displays page title on non-home pages (admin), hiding global actions', () => {
      mockState.navigation.currentTab = 'admin';
      updateTopBar(mockContext);

      const logo = document.getElementById('topBrandLogo');
      const backBtn = document.getElementById('topBackBtn');
      const navActions = document.getElementById('topNavActions');
      const title = document.querySelector('.brand-title');
      const brandBtn = document.getElementById('topBrandBtn');

      expect(logo?.classList.contains('hidden')).toBe(true);
      expect(backBtn?.classList.contains('hidden')).toBe(false);
      expect(navActions?.classList.contains('hidden')).toBe(true);
      expect(title?.textContent).toBe('Ayarlar');
      expect(brandBtn?.getAttribute('title')).toBe('Ana Sayfaya Dön');
    });

    it('hides logo and displays Not & Kanaat on grades page', () => {
      mockState.navigation.currentTab = 'grades';
      updateTopBar(mockContext);

      const logo = document.getElementById('topBrandLogo');
      const navActions = document.getElementById('topNavActions');
      const title = document.querySelector('.brand-title');

      expect(logo?.classList.contains('hidden')).toBe(true);
      expect(navActions?.classList.contains('hidden')).toBe(true);
      expect(title?.textContent).toBe('Not & Kanaat');
    });

    it('reveals topAdminBtn in top-bar', () => {
      updateTopBar(mockContext);
      const adminBtn = document.getElementById('topAdminBtn');
      expect(adminBtn?.classList.contains('hidden')).toBe(false);
    });
  });

  describe('initTopBarEvents bindings', () => {
    it('clicking topBrandBtn or topBackBtn navigates to lists (home)', () => {
      initTopBarEvents(mockContext);
      document.getElementById('topBrandBtn')?.click();
      expect(mockContext.navigate).toHaveBeenCalledWith('lists');

      document.getElementById('topBackBtn')?.click();
      expect(mockContext.navigate).toHaveBeenCalledWith('lists');
    });

    it('clicking topGradesBtn navigates to grades', () => {
      initTopBarEvents(mockContext);
      document.getElementById('topGradesBtn')?.click();
      expect(mockContext.navigate).toHaveBeenCalledWith('grades');
    });

    it('clicking topAdminBtn navigates to admin', () => {
      initTopBarEvents(mockContext);
      document.getElementById('topAdminBtn')?.click();
      expect(mockContext.navigate).toHaveBeenCalledWith('admin');
    });
  });
});
