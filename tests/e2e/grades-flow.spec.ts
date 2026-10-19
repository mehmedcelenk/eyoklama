import { test, expect } from '@playwright/test';
import { setupApp, loginAsTeacher } from './helpers/test-setup';

test.describe('Feature: Minimalist Grades & Parent Report System', () => {
  test('Veli can switch to parent tab, query student report card by TC without login', async ({ page }) => {
    await setupApp(page);

    await expect(page.locator('#loginView')).toBeVisible();

    // Click Veli Not Sorgu tab
    await page.click('#parentQueryTabBtn');
    await expect(page.locator('#parentQuerySection')).toBeVisible();
    await expect(page.locator('#teacherLoginSection')).toBeHidden();

    // Try invalid TC
    await page.fill('#parentTcInput', '12345');
    await page.click('[data-action="query-parent-report"]');
    await expect(page.locator('#toast')).toContainText('Lütfen 11 haneli T.C. Kimlik Numarası girin.');

    // Query with valid student TC (Ali Yılmaz: 10000000146)
    await page.fill('#parentTcInput', '10000000146');
    await page.click('[data-action="query-parent-report"]');

    // Verify report card is displayed
    await expect(page.locator('#parentReportResult')).toContainText('Ali Yılmaz');
    await expect(page.locator('#parentReportResult')).toContainText('9-A');
    await expect(page.locator('#parentReportResult')).toContainText("Kur'an-ı Kerim");
    await expect(page.locator('#parentReportResult')).toContainText('95');
    await expect(page.locator('#parentReportResult')).toContainText('Ezberleri gayet başarılı.');
  });

  test('Direct hash navigation #karne opens Veli tab directly', async ({ page }) => {
    await setupApp(page);
    await page.goto('/#karne');
    await expect(page.locator('#parentQuerySection')).toBeVisible();
    await expect(page.locator('#teacherLoginSection')).toBeHidden();
  });

  test('Teacher can open Not & Kanaat for a class, switch 1-2-3-4 toggles and save', async ({ page }) => {
    await loginAsTeacher(page);

    // Verify main view title is SINIFLAR
    await expect(page.locator('.section-title').first()).toContainText('SINIFLAR');

    // Find the 9-A card and click Not & Kanaat
    const gradesBtn = page.locator('#listCard-list-9a [data-action="open-grades"]');
    await expect(gradesBtn).toBeVisible();
    await gradesBtn.click();

    // Should navigate to grades page
    await expect(page.locator('#gradesPage')).toBeVisible();
    await expect(page.locator('.brand-title')).toContainText('Not & Kanaat');

    // Switch to edit mode via icon button
    await page.click('[data-action="start-grades-edit"]');

    // Verify 1, 2, 3, 4 Term and Exam toggle buttons exist
    const term2Btn = page.locator('[data-action="select-grade-term"][data-term="2"]');
    await expect(term2Btn).toBeVisible();
    await term2Btn.click();
    await expect(term2Btn).toHaveClass(/active/);

    const exam2Btn = page.locator('[data-action="select-grade-exam"][data-exam="2"]');
    await expect(exam2Btn).toBeVisible();
    await exam2Btn.click();
    await expect(exam2Btn).toHaveClass(/active/);

    // Set course name if course input exists or check select
    const courseInput = page.locator('#gradeCourseInput');
    if (await courseInput.count() > 0) {
      await courseInput.fill('Arapça');
    }

    // Enter grade and opinion for first student
    const firstGradeInput = page.locator('.student-grade-input').first();
    const firstOpinionInput = page.locator('.student-opinion-input').first();

    await firstGradeInput.fill('88');
    await firstOpinionInput.fill('Derse gayet ilgili ve başarılı.');

    // Click save
    await page.click('[data-action="save-grades"]');

    // Verify toast
    await expect(page.locator('#toast')).toContainText('Notlar ve kanaatler kaydedildi.');
  });
});
