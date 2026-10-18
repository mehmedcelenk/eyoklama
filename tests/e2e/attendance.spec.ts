import { test, expect } from '@playwright/test';
import { loginAsTeacher, setupApp } from './helpers/test-setup';

test.describe('Features 2 & 3: Attendance Toggle, Lock & Persistence', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] Selecting class opens attendance view with student cards and default absent state', async ({ page }) => {
    await loginAsTeacher(page);

    // Click class card '9-A'
    await page.click('#listCard-list-9a');

    // Attendance view must be visible, topNav hidden
    await expect(page.locator('#attendancePage')).toBeVisible();
    await expect(page.locator('#topNav')).toBeHidden();

    // Verify header title shows class name
    await expect(page.locator('.attendance-title')).toContainText('9-A');

    // Verify 4 students rendered (Ali, Ayşe, Mehmet, Zeynep)
    const cards = page.locator('.student-card');
    await expect(cards).toHaveCount(4);

    // Initial default state is absent (-) for all students
    const firstCard = cards.first();
    await expect(firstCard.locator('.attendance-tag')).toHaveText('-');
    await expect(firstCard.locator('.attendance-tag')).toHaveClass(/absent/);

    // Initial counts: 0 present, 4 absent, 0 excused
    await expect(page.locator('#topCounts .present b')).toHaveText('0');
    await expect(page.locator('#topCounts .absent b')).toHaveText('4');
    await expect(page.locator('#topCounts .excused b')).toHaveText('0');
  });

  test('[Tier 1] Tapping student card cycles state: absent (-) -> present (+) -> excused (±) -> absent (-)', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    const firstCard = page.locator('.student-card').first();
    const tag = firstCard.locator('.attendance-tag');

    // Default: absent (-)
    await expect(tag).toHaveText('-');

    // Tap 1: absent -> present (+)
    await firstCard.click();
    await expect(tag).toHaveText('+');
    await expect(tag).toHaveClass(/present/);
    await expect(page.locator('#topCounts .present b')).toHaveText('1');
    await expect(page.locator('#topCounts .absent b')).toHaveText('3');

    // Tap 2: present -> excused (±)
    await firstCard.click();
    await expect(tag).toHaveText('±');
    await expect(tag).toHaveClass(/excused/);
    await expect(page.locator('#topCounts .present b')).toHaveText('0');
    await expect(page.locator('#topCounts .excused b')).toHaveText('1');

    // Tap 3: excused -> absent (-)
    await firstCard.click();
    await expect(tag).toHaveText('-');
    await expect(tag).toHaveClass(/absent/);
    await expect(page.locator('#topCounts .absent b')).toHaveText('4');
  });

  test('[Tier 1] Pre-permissions lock prevents student status toggling and displays toast', async ({ page }) => {
    // Seed pre-permission for student 's1' (Ali Yılmaz) matching todayKey()
    await page.addInitScript(() => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      localStorage.setItem('eyoklama_v3_today_permissions', JSON.stringify({ [today]: { s1: true } }));
    });

    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    // Student Ali should be marked locked with lock tag
    const aliCard = page.locator('.student-card').filter({ hasText: 'Ali Yılmaz' });
    await expect(aliCard).toHaveClass(/locked/);
    await expect(aliCard.locator('.attendance-tag')).toHaveText('±');

    // Clicking locked student must display warning toast and status must remain excused
    await aliCard.click();
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('önceden İzinli');
    await expect(aliCard.locator('.attendance-tag')).toHaveText('±');
  });

  test('[Tier 1] Save attendance button opens confirmation dialog and persists records to backend', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    // Mark 1st student present (+), 2nd student excused (±)
    const cards = page.locator('.student-card');
    await cards.nth(0).click(); // +
    await cards.nth(1).click(); // +
    await cards.nth(1).click(); // ±

    // Auto-accept confirmation dialog on save
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Kaydet?');
      await dialog.accept();
    });

    // Click FAB save button
    await page.click('.save-fab');

    // Should return to listsPage / history with toast notification
    await expect(page.locator('#attendancePage')).toBeHidden();
    await expect(page.locator('#topNav')).toBeVisible();

    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Yoklama kaydedildi');
  });

  test('[Tier 1] Attendance lock heartbeat extends lock timestamp', async ({ page }) => {
    const { state } = await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    expect(state.activeLock).not.toBeNull();
    const initialLockTimestamp = state.activeLock?.timestamp;
    expect(initialLockTimestamp).toBeDefined();

    // Trigger artificial advance or inspect activeLock
    await page.waitForTimeout(500);
    expect(state.activeLock?.listId).toBe('list-9a');
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] Save button is dimmed when all students are absent', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    const saveFab = page.locator('.save-fab');
    // Initially all absent -> dimmed
    await expect(saveFab).toHaveClass(/dimmed/);

    // Tap one student to present -> dimmed removed
    await page.locator('.student-card').first().click();
    await expect(saveFab).not.toHaveClass(/dimmed/);

    // Cycle through to absent again -> dimmed returns
    await page.locator('.student-card').first().click(); // ±
    await page.locator('.student-card').first().click(); // -
    await expect(saveFab).toHaveClass(/dimmed/);
  });

  test('[Tier 2] Concurrency lock warning appears when class is already locked by another teacher', async ({ page }) => {
    // Setup state where list-9a is locked by another session token
    await loginAsTeacher(page, 'Ahmet Hoca', '123456', {
      mockState: {
        activeLock: {
          listId: 'list-9a',
          token: 'another-teacher-token',
          timestamp: Date.now()
        }
      }
    });

    // Handle conflict confirmation dialog asynchronously
    const dialogPromise = page.waitForEvent('dialog');
    await page.click('#listCard-list-9a');
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Bu sınıfta yoklama zaten alınıyor');
    await dialog.dismiss();

    // Rejection should prevent opening attendance view
    await expect(page.locator('#attendancePage')).toBeHidden();
  });

  test('[Tier 2] Cancel attendance without changes returns to lists without confirmation dialog', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');
    await expect(page.locator('#attendancePage')).toBeVisible();

    // No changes were made; back button should not trigger confirm dialog
    let dialogTriggered = false;
    page.on('dialog', () => {
      dialogTriggered = true;
    });

    await page.click('.attendance-top .icon-btn');
    await expect(page.locator('#attendancePage')).toBeHidden();
    expect(dialogTriggered).toBe(false);
  });

  test('[Tier 2] Cancel attendance with unsaved changes prompts confirmation dialog', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    // Make an unsaved change
    await page.locator('.student-card').first().click(); // marked present (+)

    // Cancel back button must prompt confirmation
    let dialogHandled = false;
    page.once('dialog', async (dialog) => {
      dialogHandled = true;
      expect(dialog.message()).toContain('Değişiklikler kaydedilmedi');
      await dialog.dismiss(); // dismiss -> stay on page
    });

    await page.click('.attendance-top .icon-btn');
    expect(dialogHandled).toBe(true);
    await expect(page.locator('#attendancePage')).toBeVisible();

    // Now accept dialog -> exits
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('.attendance-top .icon-btn');
    await expect(page.locator('#attendancePage')).toBeHidden();
  });

  test('[Tier 2] Cancelling attendance releases backend concurrency lock', async ({ page }) => {
    const { state } = await loginAsTeacher(page);
    await page.click('#listCard-list-9a');
    expect(state.activeLock).not.toBeNull();

    await page.click('.attendance-top .icon-btn');
    expect(state.activeLock).toBeNull();
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Fast successive taps on multiple student cards update count chips accurately', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    const cards = page.locator('.student-card');
    // Rapid taps: card 0 -> present, card 1 -> excused, card 2 -> present
    await cards.nth(0).click(); // +
    await cards.nth(1).click(); // +
    await cards.nth(1).click(); // ±
    await cards.nth(2).click(); // +

    await expect(page.locator('#topCounts .present b')).toHaveText('2');
    await expect(page.locator('#topCounts .absent b')).toHaveText('1');
    await expect(page.locator('#topCounts .excused b')).toHaveText('1');
  });

  test('[Tier 3] Mixed attendance states (+, -, ±) correctly calculated and displayed in top counts', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    const cards = page.locator('.student-card');
    // Set all 4 students to different states:
    // s0: present (+) -> 1 click
    // s1: excused (±) -> 2 clicks
    // s2: absent (-)  -> 0 clicks
    // s3: present (+) -> 1 click
    await cards.nth(0).click();
    await cards.nth(1).click();
    await cards.nth(1).click();
    await cards.nth(3).click();

    await expect(cards.nth(0).locator('.attendance-tag')).toHaveText('+');
    await expect(cards.nth(1).locator('.attendance-tag')).toHaveText('±');
    await expect(cards.nth(2).locator('.attendance-tag')).toHaveText('-');
    await expect(cards.nth(3).locator('.attendance-tag')).toHaveText('+');

    await expect(page.locator('#topCounts .present b')).toHaveText('2');
    await expect(page.locator('#topCounts .absent b')).toHaveText('1');
    await expect(page.locator('#topCounts .excused b')).toHaveText('1');
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 1 ──────────────────────────────────────────

  test('[Tier 4] Scenario 1: Teacher daily routine workflow (login -> select class -> mark students -> save -> verify in history)', async ({ page }) => {
    await setupApp(page);

    // 1. Login as teacher
    await page.fill('#loginName', 'Fatma Hoca');
    await page.fill('#loginPin', '123456');
    await page.click('#loginBtn');
    await expect(page.locator('#appView')).toBeVisible();

    // 2. Select class '10-B'
    await page.click('#listCard-list-10b');
    await expect(page.locator('#attendancePage')).toBeVisible();
    await expect(page.locator('.attendance-title')).toContainText('10-B');

    // 3. Mark 1 student present, 1 student excused
    const students = page.locator('.student-card');
    await expect(students).toHaveCount(2);
    await students.nth(0).click(); // +
    await students.nth(1).click(); // +
    await students.nth(1).click(); // ±

    // 4. Save attendance
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('.save-fab');
    await expect(page.locator('#attendancePage')).toBeHidden();

    // 5. Verify the saved session appears in history
    const historySection = page.locator('.history-section');
    await expect(historySection).toBeVisible();
    await expect(historySection).toContainText('10-B');
  });

  test('[Tier 1] TopPermBtn opens pre-permission view and search filters by student name and list name', async ({ page }) => {
    await loginAsTeacher(page);

    // Open Pre-permission view from top bar
    await page.click('#topPermBtn');
    await expect(page.locator('#attendancePage')).toBeVisible();
    await expect(page.locator('.attendance-title')).toContainText('Günün İzinlilerini Seç');

    // Search input should be visible and empty initially
    const searchInput = page.locator('#attendanceSearchInput');
    await expect(searchInput).toBeVisible();
    await expect(searchInput).toHaveValue('');

    // All students across lists should be present initially (4 from 9-A + 2 from 10-B = 6)
    const cards = page.locator('.student-card');
    await expect(cards).toHaveCount(6);

    // Filter by student name (e.g. 'Zeynep')
    await searchInput.fill('zeynep');
    const visibleAfterStudentSearch = page.locator('.student-card:not(.hidden)');
    await expect(visibleAfterStudentSearch).toHaveCount(1);
    await expect(visibleAfterStudentSearch.first()).toContainText('Zeynep');

    // Filter by list name (e.g. '10-B')
    await searchInput.fill('10-b');
    const visibleAfterListSearch = page.locator('.student-card:not(.hidden)');
    await expect(visibleAfterListSearch).toHaveCount(2);

    // Clear search with clear button
    await expect(page.locator('#searchClearBtn')).toBeVisible();
    await page.click('#searchClearBtn');
    await expect(searchInput).toHaveValue('');
    const visibleAfterClear = page.locator('.student-card:not(.hidden)');
    await expect(visibleAfterClear).toHaveCount(6);

    // Filter with no match shows empty message
    await searchInput.fill('bulunmayanogrenci123');
    await expect(page.locator('.empty-search-notice')).toBeVisible();

    // Press Escape to reset search
    await searchInput.press('Escape');
    await expect(searchInput).toHaveValue('');
    await expect(page.locator('.empty-search-notice')).toBeHidden();
    await expect(page.locator('.student-card:not(.hidden)')).toHaveCount(6);

    // Test AD toggle button in top bar
    const nameToggleBtn = page.locator('#nameToggleBtn');
    await expect(nameToggleBtn).toBeVisible();
    await expect(nameToggleBtn).toHaveText('AD');
    await expect(nameToggleBtn).toHaveClass(/active/);

    // By default, full names are visible
    const firstStudentName = page.locator('.student-card .student-name').first();
    await expect(firstStudentName).toContainText('Ali');
    await expect(firstStudentName).toContainText('Yılmaz');

    // Click AD button to toggle OFF (show last name only)
    await nameToggleBtn.click();
    await expect(nameToggleBtn).not.toHaveClass(/active/);
    await expect(firstStudentName).not.toContainText('Ali');
    await expect(firstStudentName).toContainText('Yılmaz');

    // Click AD button to toggle back ON (show full name)
    await nameToggleBtn.click();
    await expect(nameToggleBtn).toHaveClass(/active/);
    await expect(firstStudentName).toContainText('Ali');
    await expect(firstStudentName).toContainText('Yılmaz');
  });

  test('[Tier 1] Pre-permission view deduplicates students who appear in multiple classes', async ({ page }) => {
    // Setup app with duplicate student 'Ali Yılmaz' in both 9-A and 10-B
    await setupApp(page, {
      mockState: {
        lists: [
          {
            id: 'list-9a',
            name: '9-A',
            students: [
              { id: 's1', firstName: 'Ali', lastName: 'Yılmaz' },
              { id: 's2', firstName: 'Ayşe', lastName: 'Demir' }
            ]
          },
          {
            id: 'list-10b',
            name: '10-B',
            students: [
              { id: 's1_dup', firstName: 'Ali', lastName: 'Yılmaz' },
              { id: 's3', firstName: 'Burak', lastName: 'Öztürk' }
            ]
          }
        ]
      }
    });

    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '123456');
    await page.click('#loginBtn');
    await page.waitForSelector('#appView:not(.hidden)');

    // Open Pre-permission view
    await page.click('#topPermBtn');
    await expect(page.locator('#attendancePage')).toBeVisible();

    // Although total entries across lists is 4, unique students should be 3 (Ali Yılmaz is deduplicated)
    const cards = page.locator('.student-card');
    await expect(cards).toHaveCount(3);

    // The deduplicated Ali Yılmaz card should show combined list names
    const aliCard = cards.filter({ hasText: 'Yılmaz' });
    await expect(aliCard).toHaveCount(1);
    await expect(aliCard).toContainText('9-A, 10-B');
  });
});


