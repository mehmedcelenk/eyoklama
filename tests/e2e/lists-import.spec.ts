import { test, expect } from '@playwright/test';
import { loginAsTeacher, loginAsAdmin } from './helpers/test-setup';

test.describe('Feature 6: Class Lists & Student Roster Import (CSV & Manual)', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] Navigation to new class page displays creation view', async ({ page }) => {
    await loginAsTeacher(page);

    // Click top add button
    await page.click('#topAddBtn');

    // New class page should be active
    await expect(page.locator('#newPage')).toBeVisible();
    await expect(page.locator('#newListName')).toBeVisible();
    await expect(page.locator('#createListBtn')).toBeVisible();
    // Create button should initially be disabled until students are added
    await expect(page.locator('#createListBtn')).toBeDisabled();
  });

  test('[Tier 1] Manual student addition adds student to preview roster and enables create button', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    // Switch to manual mode
    await page.click('#manualModeBtn');
    await expect(page.locator('#manualMode')).toBeVisible();

    // Fill first and last name
    await page.fill('#manualFirst', 'Emre');
    await page.fill('#manualLast', 'Aydın');
    await page.click('button[title="Öğrenci ekle"]');

    // Verify preview table appears with student
    const preview = page.locator('#preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('1 öğrenci hazır');
    await expect(preview).toContainText('Emre');
    await expect(preview).toContainText('Aydın');

    // Create button should now be enabled
    await expect(page.locator('#createListBtn')).toBeEnabled();
  });

  test('[Tier 1] Removing student from preview roster decrements count and disables create button if empty', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');
    await page.click('#manualModeBtn');

    await page.fill('#manualFirst', 'Can');
    await page.fill('#manualLast', 'Yılmaz');
    await page.click('button[title="Öğrenci ekle"]');

    const preview = page.locator('#preview');
    await expect(preview).toContainText('1 öğrenci hazır');

    // Click remove button in preview row
    await preview.locator('button[title="Kaldır"]').click();

    // Preview should now be empty and create button disabled
    await expect(page.locator('#createListBtn')).toBeDisabled();
  });

  test('[Tier 1] Creating class list with valid name and roster saves list and navigates to lists view', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    // Enter class name
    await page.fill('#newListName', '11-C');

    // Add manual student
    await page.click('#manualModeBtn');
    await page.fill('#manualFirst', 'Kemal');
    await page.fill('#manualLast', 'Sunal');
    await page.click('button[title="Öğrenci ekle"]');

    // Click create list button
    await page.click('#createListBtn');

    // Should navigate back to lists page
    await expect(page.locator('#listsPage')).toBeVisible();
    await expect(page.locator('#newPage')).toBeHidden();

    // New class card should be visible
    const newCard = page.locator('.list-card').filter({ hasText: '11-C' });
    await expect(newCard).toBeVisible();
    await expect(newCard).toContainText('1 öğrenci');
  });

  test('[Tier 1] Importing students from valid CSV file parses rows into preview roster', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    // Prepare CSV buffer
    const csvContent = 'İsim,Soyisim\nAhmet,Kaya\nBeren,Saat\nCem,Yılmaz';
    const buffer = Buffer.from(csvContent, 'utf-8');

    // Upload file to file input
    await page.setInputFiles('#studentFile', {
      name: 'ogrenciler.csv',
      mimeType: 'text/csv',
      buffer
    });

    // Success notice should display
    const msg = page.locator('#importMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('3 öğrenci dosyadan yüklendi');

    // Preview should contain all 3 students
    const preview = page.locator('#preview');
    await expect(preview).toContainText('3 öğrenci hazır');
    await expect(preview).toContainText('Ahmet');
    await expect(preview).toContainText('Beren');
    await expect(preview).toContainText('Cem');
    await expect(page.locator('#createListBtn')).toBeEnabled();
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] Empty class name validation error prevents creation', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');
    await page.click('#manualModeBtn');

    // Add student without entering class name
    await page.fill('#manualFirst', 'Ali');
    await page.fill('#manualLast', 'Veli');
    await page.click('button[title="Öğrenci ekle"]');

    // Click create button
    await page.click('#createListBtn');

    // Toast error: Sınıf adını yazın
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Sınıf adını yazın');
  });

  test('[Tier 2] Empty first or last name in manual mode displays warning toast', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');
    await page.click('#manualModeBtn');

    // Only first name entered
    await page.fill('#manualFirst', 'SadeceIsim');
    await page.click('button[title="Öğrenci ekle"]');

    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('İsim ve Soyisim birlikte gerekli');
  });

  test('[Tier 2] CSV with 3rd column is rejected with explicit error message', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    const invalidCsv = 'İsim,Soyisim,Numara\nAhmet,Kaya,1234';
    await page.setInputFiles('#studentFile', {
      name: 'gecersiz.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(invalidCsv, 'utf-8')
    });

    const msg = page.locator('#importMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toHaveClass(/error/);
    await expect(msg).toContainText('3. sütun bulundu');
    await expect(page.locator('#createListBtn')).toBeDisabled();
  });

  test('[Tier 2] CSV with missing first or last name in row shows error notice with row number', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    const missingCellCsv = 'İsim,Soyisim\nAhmet,Kaya\nMehmet,\nZeynep,Demir';
    await page.setInputFiles('#studentFile', {
      name: 'eksik.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(missingCellCsv, 'utf-8')
    });

    const msg = page.locator('#importMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toHaveClass(/error/);
    await expect(msg).toContainText('2. öğrenci satırında İsim veya Soyisim eksik');
  });

  test('[Tier 2] Admin renaming class list updates class title', async ({ page }) => {
    await loginAsAdmin(page);

    // Open admin panel
    await page.click('#topAdminBtn');
    await expect(page.locator('#adminPage')).toBeVisible();

    // Expand Sınıf Yönetimi accordion
    await page.click('#adminPage summary:has-text("Sınıf Yönetimi")');

    // Find class 9-A rename button in admin panel
    const listRow = page.locator('.class-admin-row').filter({ hasText: '9-A' });
    await expect(listRow).toBeVisible();
    await listRow.locator('button[title="Ad değiştir"]').click();

    // Inline input appears
    const input = page.locator('#className-list-9a');
    await expect(input).toBeVisible();
    await input.fill('9-A Fen');

    // Click inline save button
    await page.click('button[title="Kaydet"]');

    // Toast confirms update
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Sınıf adı değiştirildi');

    // Re-expand Sınıf Yönetimi accordion to verify updated row
    await page.click('#adminPage summary:has-text("Sınıf Yönetimi")');
    await expect(page.locator('.class-admin-row').filter({ hasText: '9-A Fen' })).toBeVisible();
  });

  test('[Tier 2] Admin deleting class list removes class from system', async ({ page }) => {
    await loginAsAdmin(page);
    await page.click('#topAdminBtn');

    // Expand Sınıf Yönetimi
    await page.click('#adminPage summary:has-text("Sınıf Yönetimi")');

    // Click delete on 10-B with confirmation
    const listRow = page.locator('.class-admin-row').filter({ hasText: '10-B' });
    await expect(listRow).toBeVisible();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('silinsin mi');
      await dialog.accept();
    });
    await listRow.locator('button[title="Sil"]').click();

    // Toast confirms deletion
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Sınıf silindi');

    // Verify list is removed
    await expect(page.locator('#adminPage')).not.toContainText('10-B');
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Enter key on manual last name input triggers student addition', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');
    await page.click('#manualModeBtn');

    await page.fill('#manualFirst', 'Barış');
    await page.fill('#manualLast', 'Manço');
    await page.press('#manualLast', 'Enter');

    const preview = page.locator('#preview');
    await expect(preview).toContainText('Barış');
    await expect(preview).toContainText('Manço');
  });

  test('[Tier 3] Semicolon-delimited CSV is automatically recognized and parsed', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#topAddBtn');

    const semiCsv = 'İsim;Soyisim\nTarık;Akan\nHalit;Akçatepe';
    await page.setInputFiles('#studentFile', {
      name: 'noktali_virgul.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(semiCsv, 'utf-8')
    });

    const preview = page.locator('#preview');
    await expect(preview).toContainText('2 öğrenci hazır');
    await expect(preview).toContainText('Tarık');
    await expect(preview).toContainText('Halit');
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 2 ──────────────────────────────────────────

  test('[Tier 4] Scenario 2: Roster setup & attendance workflow (import roster -> create class -> take attendance)', async ({ page }) => {
    await loginAsTeacher(page);

    // 1. Navigate to class creation
    await page.click('#topAddBtn');
    await page.fill('#newListName', '12-A');

    // 2. Import CSV roster
    const rosterCsv = 'İsim,Soyisim\nEren,Bülbül\nFethi,Sekin';
    await page.setInputFiles('#studentFile', {
      name: 'roster.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(rosterCsv, 'utf-8')
    });
    await expect(page.locator('#preview')).toContainText('2 öğrenci hazır');

    // 3. Create class
    await page.click('#createListBtn');
    await expect(page.locator('#listsPage')).toBeVisible();

    // 4. Select newly created class and start attendance
    const createdClassCard = page.locator('.list-card').filter({ hasText: '12-A' });
    await expect(createdClassCard).toBeVisible();
    await createdClassCard.click();

    // 5. Take attendance
    await expect(page.locator('#attendancePage')).toBeVisible();
    await expect(page.locator('.attendance-title')).toContainText('12-A');
    const students = page.locator('.student-card');
    await expect(students).toHaveCount(2);

    // Mark Eren present
    await students.first().click();
    await expect(students.first().locator('.attendance-tag')).toHaveText('+');
  });
});
