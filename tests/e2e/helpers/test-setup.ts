import { Page } from '@playwright/test';
import { setupMockSupabase, MockState } from './mock-backend';

export interface SetupPageOptions {
  mockState?: Partial<MockState>;
  rememberedTeacher?: { name: string; untilDays?: number };
  role?: 'teacher' | 'admin';
}

/**
 * Boots test page with mocked backend and initialized application state
 */
export async function setupApp(page: Page, options: SetupPageOptions = {}) {
  const customMockState = { ...options.mockState };

  // Pre-configure localStorage before navigation if requested
  if (options.rememberedTeacher) {
    if (!customMockState.displayName) {
      customMockState.displayName = options.rememberedTeacher.name;
    }
    const until = new Date(Date.now() + (options.rememberedTeacher.untilDays ?? 7) * 86400000).toISOString();
    await page.addInitScript(({ name, untilDate }) => {
      localStorage.setItem('eyoklama_v3_teacher_name', name);
      localStorage.setItem('eyoklama_v3_teacher_week_until', untilDate);
    }, { name: options.rememberedTeacher.name, untilDate: until });
  }

  // Setup mock network routes
  const state = await setupMockSupabase(page, customMockState);

  // Navigate to application
  await page.goto('/');

  // await page.addScriptTag({ url: '/app.js', type: 'module' });

  // Wait for initial render of login or lists
  await page.waitForLoadState('domcontentloaded');

  return { state };
}

/**
 * Helper to log in a teacher
 */
export async function loginAsTeacher(page: Page, name = 'Ahmet Hoca', pin = '123456', options: SetupPageOptions = {}) {
  const { state } = await setupApp(page, options);
  await page.fill('#loginName', name);
  await page.fill('#loginPin', pin);
  await page.click('#loginBtn');
  await page.waitForSelector('#appView:not(.hidden)');
  return { state };
}

/**
 * Helper to log in as admin
 */
export async function loginAsAdmin(page: Page, name = 'admin', password = 'admin123', options: SetupPageOptions = {}) {
  const { state } = await setupApp(page, { ...options, role: 'admin' });
  await page.fill('#loginName', name);
  await page.fill('#loginPin', password);
  await page.click('#loginBtn');
  await page.waitForSelector('#appView:not(.hidden)');
  return { state };
}
