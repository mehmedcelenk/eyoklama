import { test, expect } from '@playwright/test';
import { loginAsTeacher, setupApp } from './helpers/test-setup';

test.describe('Feature 7: PWA Offline Capabilities, Service Worker & Manifest', () => {
  // ─── TIER 1: CATEGORY-PARTITION (HAPPY PATHS) ───────────────────────────────

  test('[Tier 1] Web App Manifest is accessible with HTTP 200 and valid JSON schema', async ({ request }) => {
    const response = await request.get('/manifest.json');
    expect(response.status()).toBe(200);

    const manifest = await response.json();
    expect(manifest.name).toBe('eYoklama V3');
    expect(manifest.short_name).toBe('eYoklama');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#000000');
    expect(manifest.background_color).toBe('#000000');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test('[Tier 1] PWA icon assets (192px and 512px) are accessible with HTTP 200', async ({ request }) => {
    const res192 = await request.get('/icon-192.svg');
    expect(res192.status()).toBe(200);
    expect(res192.headers()['content-type']).toContain('svg');

    const res512 = await request.get('/icon-512.svg');
    expect(res512.status()).toBe(200);
    expect(res512.headers()['content-type']).toContain('svg');
  });

  test('[Tier 1] Service worker file (/sw.js) is served with HTTP 200 and valid caching script', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain('CACHE_NAME');
    expect(body).toContain('install');
    expect(body).toContain('activate');
    expect(body).toContain('fetch');
  });

  test('[Tier 1] HTML head contains manifest link and mobile web app meta tags', async ({ page }) => {
    await setupApp(page);

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', 'manifest.json');

    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#000000');

    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute('href', 'icon-192.svg');
  });

  test('[Tier 1] Service worker registration is attempted by client bootstrap', async ({ page }) => {
    await page.addInitScript(() => {
      if ('serviceWorker' in navigator) {
        const origRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = async (url, options) => {
          (window as any).__swRegisteredUrl = url;
          return origRegister(url, options);
        };
      }
    });

    await setupApp(page);
    await page.waitForLoadState('load');

    const registeredUrl = await page.evaluate(() => (window as any).__swRegisteredUrl);
    expect(registeredUrl).toBe('/sw.js');
  });

  // ─── TIER 2: BOUNDARY VALUE ANALYSIS (EDGE CASES & VALIDATIONS) ──────────────

  test('[Tier 2] Service worker precache asset list contains essential application files', async ({ request }) => {
    const res = await request.get('/sw.js');
    const body = await res.text();

    const expectedAssets = ['index.html', 'manifest.json', 'icon-192.svg', 'icon-512.svg'];
    for (const asset of expectedAssets) {
      expect(body).toContain(asset);
    }
  });

  test('[Tier 2] In-flight active attendance state persists to sessionStorage under eyoklama_active', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    // Mark 1st student present (+)
    await page.locator('.student-card').first().click();

    // Verify sessionStorage has eyoklama_active
    const storedActive = await page.evaluate(() => {
      const raw = sessionStorage.getItem('eyoklama_active');
      return raw ? JSON.parse(raw) : null;
    });

    expect(storedActive).not.toBeNull();
    expect(storedActive.listId).toBe('list-9a');
    expect(storedActive.statuses['s1']).toBe('present');
  });

  test('[Tier 2] Network failure during save preserves active attendance without losing student statuses', async ({ page }) => {
    await loginAsTeacher(page);
    await page.click('#listCard-list-9a');

    // Mark 1st student (+) and 2nd student (±)
    const cards = page.locator('.student-card');
    await cards.nth(0).click(); // +
    await cards.nth(1).click(); // +
    await cards.nth(1).click(); // ±

    // Simulate network error specifically on save_attendance
    await page.route('**/rest/v1/rpc/save_attendance', (route) => route.abort());

    // Try to save
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('.save-fab');

    // Toast error must show and attendance page must remain visible
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(page.locator('#attendancePage')).toBeVisible();

    // Verify student statuses were NOT wiped out
    await expect(cards.nth(0).locator('.attendance-tag')).toHaveText('+');
    await expect(cards.nth(1).locator('.attendance-tag')).toHaveText('±');

    // Verify sessionStorage still contains active attendance
    const stored = await page.evaluate(() => sessionStorage.getItem('eyoklama_active'));
    expect(stored).not.toBeNull();
    expect(stored).toContain('present');
  });

  test('[Tier 2] Offline error notice is displayed when cleanRpcError detects navigator.onLine is false', async ({ page }) => {
    await setupApp(page);

    // Simulate browser offline
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
    });

    // Abort network calls to simulate offline network failure
    await page.route('**/rest/v1/rpc/**', (route) => route.abort());

    await page.fill('#loginName', 'Ahmet Hoca');
    await page.fill('#loginPin', '123456');
    await page.click('#loginBtn');

    // Must display "İnternet bağlantısı yok."
    const msg = page.locator('#loginMessage');
    await expect(msg).toBeVisible();
    await expect(msg).toContainText('İnternet bağlantısı yok');
  });

  // ─── TIER 3: PAIRWISE COMBINATORIAL ─────────────────────────────────────────

  test('[Tier 3] Manifest orientation is portrait-primary and icons include maskable purpose', async ({ request }) => {
    const res = await request.get('/manifest.json');
    const manifest = await res.json();

    expect(manifest.orientation).toBe('portrait-primary');
    for (const icon of manifest.icons) {
      expect(icon.purpose).toContain('maskable');
    }
  });

  test('[Tier 3] Service worker ignores external Supabase API requests from cache matching', async ({ request }) => {
    const res = await request.get('/sw.js');
    const body = await res.text();

    // Verify bypass rule for supabase
    expect(body).toContain('supabase.co');
  });

  // ─── TIER 4: REAL-WORLD SCENARIO 4 ──────────────────────────────────────────

  test('[Tier 4] Scenario 4: Offline resilience workflow (take attendance while offline -> verify local state -> save after reconnect)', async ({ page }) => {
    // 1. Log in teacher
    await loginAsTeacher(page);

    // 2. Begin attendance
    await page.click('#listCard-list-9a');
    await expect(page.locator('#attendancePage')).toBeVisible();

    // 3. Simulate offline network mode while marking students
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    // Offline toast notification
    const toast = page.locator('#toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('İnternet bağlantısı kesildi');

    // 4. Mark students while offline
    const cards = page.locator('.student-card');
    await cards.nth(0).click(); // present (+)
    await cards.nth(1).click(); // +
    await cards.nth(1).click(); // excused (±)

    // 5. Verify in-flight active state is safely stored locally
    const stored = await page.evaluate(() => sessionStorage.getItem('eyoklama_active'));
    expect(stored).toContain('present');
    expect(stored).toContain('excused');

    // 6. Network re-established
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { get: () => true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await expect(toast).toContainText('İnternet bağlantısı yeniden kuruldu');

    // 7. Save successfully
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.click('.save-fab');

    // Attendance view closed, success toast displayed
    await expect(page.locator('#attendancePage')).toBeHidden();
    await expect(toast).toContainText('Yoklama kaydedildi');
  });
});
