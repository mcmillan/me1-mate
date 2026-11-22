import type { Page, TestInfo } from '@playwright/test';
import { editorOf, expect, fits, test } from './helpers.ts';

/**
 * The layout at a range of window sizes and both colour schemes: nothing
 * stray, no sideways scroll, controls big enough to hit, no clipped key
 * labels, and on a wide window, no scrolling at all. Each run saves
 * screenshots of Home and the loaded editor in the test's output folder.
 */
const checkLayout = async (page: Page, info: TestInfo, tag: string) => {
  const editor = editorOf(page);
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
  await page.screenshot({ path: info.outputPath(`home-${tag}.png`), fullPage: true });
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  // At rest: on a phone the key opens in a sheet that slides up; measure once it has.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.timeline === document.timeline)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((done) => setTimeout(done, 2000)),
    ]),
  );

  const stray = await page.evaluate(() =>
    [...document.querySelectorAll('dialog:not([open]), [popover]:not(:popover-open)')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.outerHTML.slice(0, 60)),
  );
  expect(stray, 'no stray open dialogs or popovers').toEqual([]);

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw, 'no sideways scroll').toBeLessThanOrEqual(width);
  if (width >= 1100)
    expect(await fits(page), `${width}×${height} fits without scrolling`).toBe(true);

  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, [role=radio], input:not([type=file]):not([type=range])')]
      .filter((el) => el.checkVisibility())
      .map((el) => {
        // A small control may extend its hit area with an absolutely placed ::after or ::before.
        const r = el.getBoundingClientRect();
        const grow = (side: 'left' | 'right' | 'top' | 'bottom') =>
          Math.max(
            0,
            ...['::after', '::before'].map((pseudo) => {
              const cs = getComputedStyle(el, pseudo);
              return cs.position === 'absolute' && cs.content !== 'none'
                ? -Number.parseFloat(cs[side]) || 0
                : 0;
            }),
          );
        return {
          w: r.width + grow('left') + grow('right'),
          h: r.height + grow('top') + grow('bottom'),
          n: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30),
        };
      })
      .filter(({ w, h }) => w > 0 && (w < 24 || h < 24))
      .map(({ w, h, n }) => `${n} ${Math.round(w)}×${Math.round(h)}`),
  );
  expect(small, 'every control is at least 24×24').toEqual([]);

  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('[role=radio]')].flatMap((tile) =>
      [...tile.querySelectorAll('*')]
        .filter(
          (el) =>
            el.children.length === 0 &&
            el.scrollWidth > el.clientWidth + 1 &&
            getComputedStyle(el).overflow !== 'visible',
        )
        .map((el) => el.textContent),
    ),
  );
  expect(clipped, 'no key label is clipped').toEqual([]);
  await page.screenshot({ path: info.outputPath(`loaded-${tag}.png`), fullPage: width < 1100 });
};

const SIZES = [
  ['light', 1440, 900],
  ['dark', 1280, 720],
  ['light', 1024, 768],
  ['light', 390, 844],
  ['dark', 390, 844],
  ['light', 320, 640],
] as const;

for (const [scheme, width, height] of SIZES) {
  test.describe(`${width}×${height} ${scheme}`, () => {
    test.use({ viewport: { width, height }, colorScheme: scheme });
    test(`layout at ${width}×${height} ${scheme} @desktop`, async ({ page }, info) => {
      await checkLayout(page, info, `${width}-${scheme}`);
    });
  });
}

// On the phones, at the device's own size.
for (const scheme of ['light', 'dark'] as const) {
  test.describe(`device ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`layout on the device, ${scheme} @touch`, async ({ page }, info) => {
      await checkLayout(page, info, `device-${scheme}`);
    });
  });
}
