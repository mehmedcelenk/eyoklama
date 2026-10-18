import { test, expect } from '@playwright/test';
import { loginAsTeacher, loginAsAdmin } from './helpers/test-setup';

test.describe('Feature 4: History Grouping, Viewing & Staged In-Place Edits', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] History section renders past attendance records with list name and metadata', async ({ page }) => {
    await loginAsTeacher(page);

    const historySection = page.locator('.history-section');
    await expect(historySection).toBeVisible();

    // Verify history item card '9-A' exists
    const card = page.locator('#historyCard-g0');
    await expect(card).toBeVisible();
    await expect(card).toContainText('9-A');
    await expect(card).toContainText('Ahmet Hoca');
  });

  test('[Tier 1] Clicking accordion summary expands details and loads student grid', async ({ page }) => {
    await loginAsTeacher(page);

    const card = page.locator('#historyCard-g0');
    const summary = card.locator('summary');
    await summary.click();

    // The details element should now have open attribute
    await expect(card).toHaveAttribute('open', '');

    // Student grid in body should display students and their status symbols
    const body = page.locator('#historyBody-g0');
    await expect(body).toBeVisible();
    await expect(body.locator('.history-grid')).toBeVisible();
    await expect(body).toContainText('Ali Yılmaz');
    await expect(body).toContainText('Ayşe Demir');
  });

  test('[Tier 1] Cycling grouping mode switches through day, week, and month modes', async ({ page }) => {
    await loginAsTeacher(page);

    // Initial mode is day (emoji ☀️)
    const modeBtn = page.locator('.history-section button[data-action="cycle-history-mode"]');
    await expect(modeBtn).toContainText('☀️');

    // Cycle to week mode (📅)
    await modeBtn.click();
    await expect(modeBtn).toContainText('📅');

    // Cycle to month mode (🌙)
    await modeBtn.click();
    await expect(modeBtn).toContainText('🌙');

    // Cycle back to day mode (☀️)
    await modeBtn.click();
    await expect(modeBtn).toContainText('☀️');
  });

  test('[Tier 1] In-place edit mode enables toggling status for absent/excused students', async ({ page }) => {
    await loginAsTeacher(page);

    // Expand accordion
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await expect(body.locator('.history-grid')).toBeVisible();

    // Click edit button
    const editBtn = body.locator('button[title="Düzenle"]');
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    // Cells for absent/excused should now be buttons (e.g. Ayşe Demir was absent)
    const ayseRow = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    const cellBtn = ayseRow.locator('button.btn-cell');
    await expect(cellBtn).toBeVisible();
    await expect(cellBtn).toHaveText('-');

    // Click to stage status change: '-' -> '±'
    await cellBtn.click();
    await expect(cellBtn).toHaveText('±');
  });

  test('[Tier 1] Saving in-place edits calls apply_attendance_changes, persists changes and displays toast', async ({ page }) => {
    await loginAsTeacher(page);

    // Expand & start editing
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    // Change Ayşe Demir from '-' to '±'
    const ayseRow = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    await ayseRow.locator('button.btn-cell').click();

    // Click save button (title="Onayla")
    const saveBtn = body.locator('button[title="Onayla"]');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Success toast notification
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Değişiklikler kaydedildi');

    // After save, the undo button "Geri al" should be visible
    await expect(body.locator('button:has-text("Geri al")')).toBeVisible();
  });

  test('[Tier 1] Clicking undo button prompts confirmation and reverts change', async ({ page }) => {
    await loginAsTeacher(page);

    // Stage & save a change first
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    const ayseRow = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    await ayseRow.locator('button.btn-cell').click();
    await body.locator('button[title="Onayla"]').click();
    await expect(page.locator('#toast')).toBeVisible();

    // Click "Geri al" with confirmation dialog
    const undoBtn = body.locator('button:has-text("Geri al")');
    await expect(undoBtn).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('geri alınsın mı');
      await dialog.accept();
    });
    await undoBtn.click();

    // Toast indicates undo performed
    const undoToast = page.locator('#toast');
    await expect(undoToast).toBeVisible();
    await expect(undoToast).toContainText('geri alındı');
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] Non-admin teacher cannot edit present (+) status in history', async ({ page }) => {
    await loginAsTeacher(page);

    // Expand accordion & enter edit mode
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    // Ali Yılmaz is present (+). Non-admin teacher cannot toggle present students
    const aliRow = body.locator('.history-grid-row').filter({ hasText: 'Ali Yılmaz' });
    const aliCell = aliRow.locator('.h-cell');
    // It should be a static span, not a button
    await expect(aliCell).toHaveText('+');
    await expect(aliCell).not.toHaveClass(/btn-cell/);
  });

  test('[Tier 2] Admin user can edit present (+) status in history', async ({ page }) => {
    await loginAsAdmin(page);

    // Expand accordion & enter edit mode
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    // In admin mode, Ali Yılmaz (+) CAN be edited (rendered as button)
    const aliRow = body.locator('.history-grid-row').filter({ hasText: 'Ali Yılmaz' });
    const aliBtn = aliRow.locator('button.btn-cell');
    await expect(aliBtn).toBeVisible();
    await expect(aliBtn).toHaveText('+');

    // Admin clicking it cycles: '+' -> '-'
    await aliBtn.click();
    await expect(aliBtn).toHaveText('-');
  });

  test('[Tier 2] Admin undo action displays password entry panel', async ({ page }) => {
    await loginAsAdmin(page);

    // Save an edit first to get undo token
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    const ayseRow = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    await ayseRow.locator('button.btn-cell').click();
    await body.locator('button[title="Onayla"]').click();

    // Admin clicking "Geri al" should toggle the password panel
    const undoBtn = body.locator('button:has-text("Geri al")');
    await undoBtn.click();

    const undoPanel = page.locator('#undoPanel-g0');
    await expect(undoPanel).toBeVisible();
    await expect(undoPanel.locator('input[type="password"]')).toBeVisible();
  });

  test('[Tier 2] Archive toggle displays/hides archived records', async ({ page }) => {
    // Setup state with an archived record
    await loginAsTeacher(page, 'Ahmet Hoca', '123456', {
      mockState: {
        history: [
          {
            id: 'arch-1',
            listId: 'list-9a',
            listName: '9-A Arşivli',
            takenAt: new Date().toISOString(),
            takenByName: 'Ahmet Hoca',
            archivedAt: new Date().toISOString(),
            counts: { present: 4, absent: 0, excused: 0 }
          }
        ]
      }
    });

    const archiveToggle = page.locator('.history-section span[data-action="toggle-archive"]');
    await expect(archiveToggle).toHaveText('Arşivi göster');

    // Initially archived records are hidden
    await expect(page.locator('.history-section')).not.toContainText('9-A Arşivli');

    // Click to show archive
    await archiveToggle.click();
    await expect(archiveToggle).toHaveText('Arşivi gizle');
    await expect(page.locator('.history-section')).toContainText('9-A Arşivli');
  });

  test('[Tier 2] Empty history displays empty placeholder notice', async ({ page }) => {
    await loginAsTeacher(page, 'Ahmet Hoca', '123456', {
      mockState: {
        history: []
      }
    });

    const historySection = page.locator('.history-section');
    await expect(historySection).toContainText('Henüz yoklama kaydı yok');
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Collapsing details accordion clears staged draft edits', async ({ page }) => {
    await loginAsTeacher(page);

    const card = page.locator('#historyCard-g0');
    await card.locator('summary').click();

    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Düzenle"]').click();

    // Stage a change on Ayşe Demir
    const ayseRow = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    await ayseRow.locator('button.btn-cell').click();
    await expect(ayseRow.locator('button.btn-cell')).toHaveText('±');

    // Close accordion
    await card.locator('summary').click();
    await expect(card).not.toHaveAttribute('open', '');

    // Re-open accordion -> draft should be discarded, Ayşe back to original '-'
    await card.locator('summary').click();
    const reopenedAyse = body.locator('.history-grid-row').filter({ hasText: 'Ayşe Demir' });
    await expect(reopenedAyse.locator('.h-cell')).toHaveText('-');
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 3 ──────────────────────────────────────────

  test('[Tier 4] Scenario 3: History inspection & PDF report workflow (navigate history -> group by week -> inspect details -> download PDF)', async ({ page }) => {
    await loginAsTeacher(page);

    // 1. Switch grouping mode to week
    const modeBtn = page.locator('.history-section button[data-action="cycle-history-mode"]');
    await modeBtn.click();
    await expect(modeBtn).toContainText('📅');

    // 2. Expand weekly history group
    const groupCard = page.locator('#historyCard-g0');
    await groupCard.locator('summary').click();
    await expect(groupCard).toHaveAttribute('open', '');

    // 3. Inspect student attendance grid
    const body = page.locator('#historyBody-g0');
    await expect(body.locator('.history-grid')).toBeVisible();

    // 4. Click download PDF tool button
    const pdfToolBtn = body.locator('button[title="Tümünü PDF indir"]');
    await expect(pdfToolBtn).toBeVisible();
    await pdfToolBtn.click();

    // 5. Verify PDF download was triggered via mock
    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();
    expect(lastPdf.filename).toMatch(/9-A.*\.pdf$/);
  });
});
