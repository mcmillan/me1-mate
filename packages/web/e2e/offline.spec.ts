import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

/**
 * After one visit the app must open and work with no network: a laptop at a
 * venue with no wifi. Runs against the production build (the service worker
 * only exists there). Chromium only: Playwright can't drive a service worker
 * offline in Firefox or WebKit.
 *
 * Also what a deploy does to someone who has visited: GitHub Pages lets its CDN
 * and the browser keep files for 10 minutes, and the worker mustn't keep or
 * show an old page whose scripts the deploy has removed.
 */

test.use({ serviceWorkers: 'allow' });

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'service workers are driven in Chromium only',
);

const fixture = (name: string) =>
  fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

const home = (page: Page) => page.getByRole('button', { name: 'Try the example' });
const configName = (page: Page) => page.getByLabel(/^Config name/);

/** Visit online and wait until the service worker controls the page. */
const visitOnce = async (page: Page, url = '/') => {
  await page.goto(url);
  await expect(home(page)).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) =>
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
    );
  });
};

test.describe('after one visit', () => {
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
});

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** The page as served, for a test to tamper with. */
const servedPage = async (page: Page) => (await page.request.get('/index.html')).text();

test.describe('just after a deploy', () => {
  test('a stale page from the CDN is not saved for offline use', async ({ page, context }) => {
    // The CDN still has the previous build's page: its scripts are gone.
    const stale = (await servedPage(page)).replaceAll('/assets/', '/assets/old-');
    await context.route(
      (url) => url.pathname === '/index.html' && url.search === '',
      (route) => route.fulfill({ contentType: 'text/html', body: stale }),
    );
    await visitOnce(page);
    await context.setOffline(true);
    await page.reload();
    await expect(home(page)).toBeVisible();
  });

  test('an online visit gets the new page past the HTTP cache', async ({ page }) => {
    // Served as Pages serves it, with max-age=600, by a server of our own:
    // a page Playwright fulfils never reaches the browser's HTTP cache.
    let build = 'one';
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    const server = createServer(async (request, response) => {
      const path = new URL(request.url ?? '/', 'http://x').pathname;
      const file = path === '/' ? 'index.html' : path.slice(1);
      try {
        let body: Buffer | string = await readFile(join(dist, file));
        if (file === 'index.html') {
          body = body
            .toString()
            .replace('<title>', `<meta name="build" content="${build}"><title>`);
        }
        response.writeHead(200, {
          'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'max-age=600',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    const url = `http://localhost:${port}/`;
    try {
      const served = () => page.locator('meta[name=build]').getAttribute('content');
      await visitOnce(page, url);
      expect(await served()).toBe('one');
      build = 'two';
      // A fresh visit, not a reload: a reload skips the HTTP cache by itself.
      await page.goto(url);
      expect(await served()).toBe('two');
    } finally {
      server.close();
    }
  });
});
