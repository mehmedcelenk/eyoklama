import { test, expect } from '@playwright/test';
import { loginAsTeacher } from './helpers/test-setup';

test.describe('Feature 5: PDF Export Subsystem & Absentee Filtering', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] Single session PDF export from history details triggers pdfMake download', async ({ page }) => {
    await loginAsTeacher(page);

    // Expand history group g0
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await expect(body.locator('.history-grid')).toBeVisible();

    // Click download history PDF button
    const downloadBtn = body.locator('button[title="Tümünü PDF indir"]');
    await expect(downloadBtn).toBeVisible();
    await downloadBtn.click();

    // Verify mock download recorded
    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();
    expect(lastPdf.filename).toMatch(/9-A.*\.pdf$/);
    expect(lastPdf.doc).toBeDefined();
    expect(lastPdf.doc.pageSize).toBe('A4');
  });

  test('[Tier 1] Day summary PDF download triggers from date divider header button', async ({ page }) => {
    await loginAsTeacher(page);

    // In default day mode, find day header download button
    const dayDownloadBtn = page.locator('.history-day-download').first();
    await expect(dayDownloadBtn).toBeVisible();
    await dayDownloadBtn.click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();
    expect(lastPdf.filename).toMatch(/^gunun-yoklamasi-.*\.pdf$/);
    expect(lastPdf.doc.content).toBeDefined();
  });

  test('[Tier 1] Weekly range PDF download triggers from week divider header button', async ({ page }) => {
    await loginAsTeacher(page);

    // Switch to week mode
    await page.click('.history-section button[data-action="cycle-history-mode"]');
    await expect(page.locator('.history-section button[data-action="cycle-history-mode"]')).toContainText('📅');

    // Click week download button
    const weekDownloadBtn = page.locator('.history-day-download').first();
    await expect(weekDownloadBtn).toBeVisible();
    await weekDownloadBtn.click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();
    expect(lastPdf.filename).toContain('yoklama-cizelgesi');
  });

  test('[Tier 1] PDF table filters out 100% present students, including only absent and excused students', async ({ page }) => {
    // In mock state for att-101:
    // Ali: present (+), Ayşe: absent (-), Mehmet: excused (±), Zeynep: present (+)
    await loginAsTeacher(page);

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Tümünü PDF indir"]').click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();

    // Serialize doc content to text to verify student inclusion
    const contentStr = JSON.stringify(lastPdf.doc.content);

    // Ayşe (absent) and Mehmet (excused) must be in the document
    expect(contentStr).toContain('Ayşe Demir');
    expect(contentStr).toContain('Mehmet Kaya');

    // Ali and Zeynep (present) should be excluded from the absentee list
    expect(contentStr).not.toContain('Ali Yılmaz');
    expect(contentStr).not.toContain('Zeynep Çelik');
  });

  test('[Tier 1] PDF document definition includes table header row with Student column', async ({ page }) => {
    await loginAsTeacher(page);

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Tümünü PDF indir"]').click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    const contentStr = JSON.stringify(lastPdf.doc.content);
    expect(contentStr).toContain('Öğrenci');
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] When all students are present, PDF contains all-present notice instead of empty table', async ({ page }) => {
    // Setup state where all students are present
    const today = new Date().toISOString();
    await loginAsTeacher(page, 'Ahmet Hoca', '123456', {
      mockState: {
        history: [
          {
            id: 'att-all-present',
            listId: 'list-9a',
            listName: '9-A',
            takenAt: today,
            takenByName: 'Ahmet Hoca',
            archivedAt: null,
            counts: { present: 4, absent: 0, excused: 0 },
            entries: [
              { id: 'e1', studentId: 's1', firstName: 'Ali', lastName: 'Yılmaz', status: 'present' },
              { id: 'e2', studentId: 's2', firstName: 'Ayşe', lastName: 'Demir', status: 'present' },
              { id: 'e3', studentId: 's3', firstName: 'Mehmet', lastName: 'Kaya', status: 'present' },
              { id: 'e4', studentId: 's4', firstName: 'Zeynep', lastName: 'Çelik', status: 'present' }
            ]
          }
        ]
      }
    });

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Tümünü PDF indir"]').click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();

    const contentStr = JSON.stringify(lastPdf.doc.content);
    expect(contentStr).toContain('Tüm öğrenciler mevcuttur');
  });

  test('[Tier 2] Special Turkish characters in student names are preserved in generated doc', async ({ page }) => {
    const today = new Date().toISOString();
    await loginAsTeacher(page, 'Ahmet Hoca', '123456', {
      mockState: {
        history: [
          {
            id: 'att-turkish-chars',
            listId: 'list-9a',
            listName: '9-A',
            takenAt: today,
            takenByName: 'Ahmet Hoca',
            archivedAt: null,
            counts: { present: 0, absent: 1, excused: 1 },
            entries: [
              { id: 'e1', studentId: 's1', firstName: 'Şükrü', lastName: 'Öztürk', status: 'absent' },
              { id: 'e2', studentId: 's2', firstName: 'Çağla', lastName: 'İğci', status: 'excused' }
            ]
          }
        ]
      }
    });

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Tümünü PDF indir"]').click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    const contentStr = JSON.stringify(lastPdf.doc.content);

    // Verify Turkish characters preserved in PDF definitions
    expect(contentStr).toContain('Şükrü Öztürk');
    expect(contentStr).toContain('Çağla İğci');
  });

  test('[Tier 2] Multiple successive PDF export clicks trigger separate downloads without error', async ({ page }) => {
    await loginAsTeacher(page);

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    const btn = body.locator('button[title="Tümünü PDF indir"]');

    // Click 1
    await btn.click();
    await page.waitForTimeout(200);
    const pdf1 = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(pdf1).not.toBeNull();

    // Click 2
    await btn.click();
    await page.waitForTimeout(200);
    const pdf2 = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(pdf2).not.toBeNull();
    expect(pdf2.timestamp).toBeGreaterThanOrEqual(pdf1.timestamp);
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Single lesson column PDF export triggers *-ders.pdf download', async ({ page }) => {
    await loginAsTeacher(page);

    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');

    // In footer col actions, click single lesson download button
    const singleLessonBtn = body.locator('.history-col-actions button.h-download-btn').first();
    await expect(singleLessonBtn).toBeVisible();
    await singleLessonBtn.click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();
    expect(lastPdf.filename).toMatch(/.*-ders\.pdf$/);
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 3 VERIFICATION ────────────────────────────

  test('[Tier 4] Scenario 3 verification: Exported PDF definition contains proper metadata and styling', async ({ page }) => {
    await loginAsTeacher(page);

    // Expand history group
    await page.click('#historyCard-g0 summary');
    const body = page.locator('#historyBody-g0');
    await body.locator('button[title="Tümünü PDF indir"]').click();

    await page.waitForTimeout(500);
    const lastPdf = await page.evaluate(() => (window as any).__lastDownloadedPdf);
    expect(lastPdf).not.toBeNull();

    const doc = lastPdf.doc;
    expect(doc.defaultStyle).toBeDefined();
    expect(doc.defaultStyle.font).toBe('Roboto');
    expect(doc.pageMargins).toEqual([24, 24, 24, 28]);
  });
});
