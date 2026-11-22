import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers.ts';

/**
 * What a screen reader says, in every engine: Guidepup's virtual screen reader
 * runs in the page, follows focus and live regions, and logs what it would
 * speak. It isn't VoiceOver (see `voiceover.spec.ts`, run on macOS in CI), but
 * it hears the same accessible names, roles, states and announcements.
 */
const bundle = readFileSync(
  createRequire(import.meta.url).resolve('@guidepup/virtual-screen-reader/browser.js'),
  'utf8',
);

/** Start the virtual screen reader on the page, and functions to read what it said. */
const listen = async (page: Page) => {
  await page.route('**/__e2e/vsr.js', (route) =>
    route.fulfill({ body: bundle, contentType: 'text/javascript' }),
  );
  await page.route('**/__e2e/vsr-start.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `import { virtual } from './vsr.js';
        await virtual.start({ container: document.body });
        window.__vsr = virtual;`,
    }),
  );
  await page.addScriptTag({ url: '/__e2e/vsr-start.js', type: 'module' });
  await page.waitForFunction(() => '__vsr' in window);
  type Vsr = { spokenPhraseLog(): Promise<string[]>; clearSpokenPhraseLog(): Promise<void> };
  return {
    /** Everything said since the last `clear`. */
    log: () => page.evaluate(() => (window as unknown as { __vsr: Vsr }).__vsr.spokenPhraseLog()),
    clear: () =>
      page.evaluate(() => (window as unknown as { __vsr: Vsr }).__vsr.clearSpokenPhraseLog()),
  };
};

/** Wait until something said matches. */
const heard = async (sr: Awaited<ReturnType<typeof listen>>, pattern: RegExp) => {
  await expect.poll(async () => (await sr.log()).join('\n')).toMatch(pattern);
};

test('the example, a key, and its neighbour are spoken', async ({ editor, page }) => {
  await editor.button('Try the example').click();
  await expect(editor.keyGrid).toBeVisible();
  const sr = await listen(page);
  await editor.tiles.nth(0).focus();
  await heard(sr, /radio.*Key 1: Drums|Key 1: Drums.*radio/i);
  await sr.clear();
  await page.keyboard.press('ArrowRight');
  await heard(sr, /Key 2: /);
  await heard(sr, /checked/i);
});

test('a channel pick says whether it is pressed', async ({ editor, page }) => {
  await editor.startNew();
  const sr = await listen(page);
  await editor.pick(5).focus();
  await heard(sr, /Channel 5.*not pressed|not pressed.*Channel 5/i);
  await sr.clear();
  await page.keyboard.press('Enter');
  await heard(sr, /polite: Unsaved changes/);
  // The virtual reader speaks on focus, so come back to the chip to hear its new state.
  await editor.pick(6).focus();
  await sr.clear();
  await editor.pick(5).focus();
  await heard(sr, /Channel 5/);
  expect((await sr.log()).join('\n')).not.toMatch(/not pressed/i);
  expect((await sr.log()).join('\n')).toMatch(/pressed/i);
});

test('a problem with a field is announced once you leave it', async ({ editor, page }) => {
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  const sr = await listen(page);
  await editor.label.fill('Pc!');
  await editor.label.press('Tab');
  await heard(sr, /Key 2's label/);
});

test('the delete dialog is announced, and Escape closes it', async ({ editor, page }) => {
  await editor.button('Try the example').click();
  await editor.home.click();
  const sr = await listen(page);
  const del = editor.sessions.getByRole('button', { name: /^Delete / }).first();
  await del.focus();
  await page.keyboard.press('Enter');
  await heard(sr, /dialog.*Delete this session\?|Delete this session\?.*dialog/i);
  await sr.clear();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Delete this session?' })).toBeHidden();
  await expect(del, 'focus goes back to the button that opened it').toBeFocused();
  await heard(sr, /Delete /);
});

test('a tour step is announced as a dialog', async ({ editor, page }) => {
  await editor.startNew();
  const sr = await listen(page);
  await editor.button('Show me around').click();
  await heard(sr, /dialog.*Keys|Keys.*dialog/i);
});
