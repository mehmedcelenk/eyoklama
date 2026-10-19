import { test, expect } from '@playwright/test';
import { setupApp } from './helpers/test-setup';

test.describe('Feature 1: Authentication & Authorization (Teacher PIN & Admin)', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] Teacher PIN login with valid credentials succeeds and loads lists', async ({ page }) => {
    await setupApp(page);

    await expect(page.locator('#loginView')).toBeVisible();
    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '123456');
    await page.click('#loginBtn');

    // Should transition to main app view
    await expect(page.locator('#loginView')).toBeHidden();
    await expect(page.locator('#appView')).toBeVisible();
    await expect(page.locator('.lists-section')).toBeVisible();

    // Verify lists rendered
    await expect(page.locator('#listCard-list-9a')).toBeVisible();
    await expect(page.locator('#listCard-list-10b')).toBeVisible();
  });

  test('[Tier 1] Weekly session memory displays continue button and allows 1-click login', async ({ page }) => {
    // Seed remembered teacher in localStorage
    await setupApp(page, {
      rememberedTeacher: { name: 'Mehmet Hoca', untilDays: 5 }
    });

    // Verify continueLogin block is displayed
    const continueBox = page.locator('#continueLogin');
    await expect(continueBox).toBeVisible();
    await expect(page.locator('#credentialLogin')).toBeHidden();

    const continueBtn = page.locator('#continueTeacherBtn');
    await expect(continueBtn).toContainText('Mehmet Hoca olarak devam et');

    // Clicking continue button logs in directly
    await continueBtn.click();
    await expect(page.locator('#loginView')).toBeHidden();
    await expect(page.locator('#appView')).toBeVisible();
  });

  test('[Tier 1] Different teacher button switches back to credential inputs', async ({ page }) => {
    await setupApp(page, {
      rememberedTeacher: { name: 'Ayşe Hoca', untilDays: 3 }
    });

    await expect(page.locator('#continueLogin')).toBeVisible();
    await page.click('#differentTeacherBtn');

    // Should hide continue login and show credential login with cleared or editable fields
    await expect(page.locator('#continueLogin')).toBeHidden();
    await expect(page.locator('#credentialLogin')).toBeVisible();
    await expect(page.locator('#loginName')).toBeVisible();
  });

  test('[Tier 1] Admin login with password provides admin role and exposes admin button', async ({ page }) => {
    await setupApp(page);

    await page.fill('#loginName', 'admin');
    await page.fill('#loginPin', 'admin123');
    await page.click('#loginBtn');

    await expect(page.locator('#appView')).toBeVisible();

    // In admin mode, the top navigation admin gear button must be visible
    const adminBtn = page.locator('#topAdminBtn');
    await expect(adminBtn).toBeVisible();
    await expect(adminBtn).not.toHaveClass(/hidden/);
  });

  test('[Tier 1] Teacher logout confirms and returns to login view', async ({ page }) => {
    await setupApp(page);

    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '123456');
    await page.click('#loginBtn');
    await expect(page.locator('#appView')).toBeVisible();

    // Handle logout confirmation dialog
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.click('#topLogoutBtn');

    // Should return to login view
    await expect(page.locator('#appView')).toBeHidden();
    await expect(page.locator('#loginView')).toBeVisible();
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] Empty teacher name or PIN displays error notice', async ({ page }) => {
    await setupApp(page);

    // Case A: Completely empty
    await page.click('#loginBtn');
    const msg = page.locator('#loginMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('Hoca adını yazın');

    // Case B: Name filled, empty PIN
    await page.fill('#loginName', 'Ahmet Hoca');
    await page.click('#loginBtn');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('PIN / parolayı yazın');
  });

  test('[Tier 2] Invalid PIN displays error message', async ({ page }) => {
    await setupApp(page);

    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '999999'); // wrong PIN
    await page.click('#loginBtn');

    const msg = page.locator('#loginMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('Hatalı PIN girdiniz');
  });

  test('[Tier 2] Brute force rate limiting blocks login after 3 failed attempts for 30s', async ({ page }) => {
    await setupApp(page);

    // Perform 3 failed attempts
    for (let i = 0; i < 3; i++) {
      await page.fill('#loginName', 'Ahmet Hoca');
      await page.fill('#loginPin', '00000' + i);
      await page.click('#loginBtn');
      await expect(page.locator('#loginMessage')).toBeVisible();
    }

    // 4th attempt should immediately hit the rate limiter
    await page.click('#loginBtn');
    const msg = page.locator('#loginMessage');
    await expect(msg).toContainText('Çok fazla hatalı deneme yapıldı');
    await expect(msg).toContainText('saniye bekleyin');
  });

  test('[Tier 2] Password reveal button toggles password input type for 1 second', async ({ page }) => {
    await setupApp(page);

    const pinInput = page.locator('#loginPin');
    await expect(pinInput).toHaveAttribute('type', 'password');

    // Click eye button
    await page.click('#passwordEyeBtn');
    await expect(pinInput).toHaveAttribute('type', 'text');

    // Wait for the 1-second timer to auto-hide
    await page.waitForTimeout(1100);
    await expect(pinInput).toHaveAttribute('type', 'password');
  });

  test('[Tier 2] Expired weekly token falls back to credential login', async ({ page }) => {
    // Seed an expired weekly token
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    await setupApp(page, {
      mockState: {
        displayName: 'Eski Hoca'
      }
    });

    await page.evaluate((date) => {
      localStorage.setItem('eyoklama_v3_teacher_name', 'Eski Hoca');
      localStorage.setItem('eyoklama_v3_teacher_week_until', date);
    }, pastDate);

    await page.reload();

    // Expired token should not show continue button, but credentials view
    await expect(page.locator('#continueLogin')).toBeHidden();
    await expect(page.locator('#credentialLogin')).toBeVisible();
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Leading and trailing whitespace in name and PIN is trimmed', async ({ page }) => {
    await setupApp(page);

    await page.fill('#loginName', '   Ahmet Hoca   ');
    await page.fill('#loginPin', '   123456   ');
    await page.click('#loginBtn');

    await expect(page.locator('#appView')).toBeVisible();
  });

  test('[Tier 3] Enter key in PIN input triggers login submission', async ({ page }) => {
    await setupApp(page);

    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '123456');
    await page.press('#loginPin', 'Enter');

    await expect(page.locator('#appView')).toBeVisible();
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 5 ──────────────────────────────────────────

  test('[Tier 4] Scenario 5: Admin administration workflow (login -> inspect admin panel)', async ({ page }) => {
    await setupApp(page);

    // 1. Admin login
    await page.fill('#loginName', 'admin');
    await page.fill('#loginPin', 'admin123');
    await page.click('#loginBtn');
    await expect(page.locator('#appView')).toBeVisible();

    // 2. Click top admin button
    await page.click('#topAdminBtn');
    await expect(page.locator('#adminPage')).toBeVisible();

    // 3. Admin panel shows PIN management and admin actions
    await expect(page.locator('#topNav .brand-title')).toContainText('Ayarlar');
  });
});
