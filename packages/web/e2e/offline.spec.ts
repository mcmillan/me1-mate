import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

/**
 * After one visit the app must open and work with no network: a laptop at a
 * venue with no wifi. Runs against the production build (the service worker
 * only exists there); see playwright.offline.config.ts.
 */

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

const home = (page: Page) => page.getByRole('button', { name: 'Try the example' });
const configName = (page: Page) => page.getByLabel(/^Config name/);

/** Visit online and wait until the service worker controls the page. */
const visitOnce = async (page: Page) => {
  await page.goto('/');
  await expect(home(page)).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    );
  });
};

test.beforeEach(async ({ page, context }) => {
  await visitOnce(page);
  await context.setOffline(true);
  await page.reload();
});

test('Home renders offline', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'ME-1 Mate' })).toBeVisible();
  await expect(home(page)).toBeVisible();
  // The typeface came from the cache too.
  expect(await page.evaluate(() => document.fonts.check('16px Allo'))).toBe(true);
});

test('Try the example opens the editor offline', async ({ page }) => {
  await home(page).click();
  await expect(page.getByRole('radiogroup', { name: 'Keys' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(16);
});

test('opening an .ME1 and its .meu works offline', async ({ page }) => {
  await page
    .locator('input[type=file]')
    .setInputFiles([fixture('JOSEPH.ME1'), fixture('JOSEPH.meu')]);
  await expect(page.getByRole('radiogroup', { name: 'Keys' })).toBeVisible();
  await expect(configName(page)).toHaveValue('JOSEPH');
});
