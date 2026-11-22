import { expect, test } from '@playwright/test';

/**
 * What browsers, crawlers and link unfurlers get before any script runs: the
 * manifest and icons for installing, and the description, canonical URL, link
 * preview tags and structured data in the served HTML.
 */

const CANONICAL = 'https://me1-mate.msd.audio/';

test('the manifest is valid and its icons load', async ({ request }) => {
  const response = await request.get('manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'ME-1 Mate',
    short_name: 'ME-1 Mate',
    start_url: './',
    scope: './',
    display: 'standalone',
  });
  const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
  expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const src of [...icons.map((icon) => icon.src), 'apple-touch-icon.png', 'og-image.png']) {
    const image = await request.get(src);
    expect(image.ok(), src).toBe(true);
    expect(image.headers()['content-type'], src).toBe('image/png');
  }
});

test('the page links the manifest without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the example' })).toBeVisible();
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');
  expect(errors).toEqual([]);
});

test('Chrome finds the manifest valid and the app installable', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the example' })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.url).toMatch(/\/manifest\.webmanifest$/);
  expect(manifest.errors).toEqual([]);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors).toEqual([]);
});

test('the served HTML describes the app for crawlers and link previews', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const root = html
    .slice(html.indexOf('<div id="root">'), html.indexOf('</main>'))
    .replace(/\s+/g, ' ');
  expect(root).toContain('ME-1 Mate');
  expect(root).toContain('Not affiliated with Allen &amp; Heath');
  for (const step of ['Pick a key.', 'Pick its channels.', 'Set levels and export.']) {
    expect(root).toContain(step);
  }
  expect(html).toContain(`<link rel="canonical" href="${CANONICAL}" />`);
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) {
    expect(html).toMatch(new RegExp(`<meta\\s+property="${tag}"\\s+content="[^"]+"`));
  }
  expect(html).toContain(`<meta property="og:image" content="${CANONICAL}og-image.png" />`);
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');

  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  expect(json).toBeDefined();
  expect(JSON.parse(json ?? '')).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ME-1 Mate',
    url: CANONICAL,
    operatingSystem: 'Any (web browser)',
    offers: { price: '0' },
  });
});

test('robots.txt and the sitemap are served', async ({ request }) => {
  expect(await (await request.get('robots.txt')).text()).toContain(
    `Sitemap: ${CANONICAL}sitemap.xml`,
  );
  expect(await (await request.get('sitemap.xml')).text()).toContain(`<loc>${CANONICAL}</loc>`);
});

test('React replaces the static description once it mounts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try the example' })).toBeVisible();
  await expect(page.locator('.pre')).toHaveCount(0);
});
