/**
 * Shared fixtures for the end-to-end tests: a page that starts on Home with
 * empty storage and the tour already seen, fails the test on any page error,
 * and the editor's parts by their roles and names.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };

/** The core's real fixture files. Read only; never edit them. */
export const FIXTURES = fileURLToPath(new URL('../../core/test/fixtures/', import.meta.url));
export const JOSEPH = [join(FIXTURES, 'JOSEPH.ME1'), join(FIXTURES, 'JOSEPH.meu')];

export const TOUR_KEY = 'me1-mate:tour:v1';

/** The editor's parts, by their roles and names. */
export const editorOf = (page: Page) => {
  const button = (name: string | RegExp) =>
    page.getByRole('button', typeof name === 'string' ? { name, exact: true } : { name });
  const tiles = page.getByRole('radio');
  const keyGrid = page.getByRole('radiogroup', { name: 'Keys' });
  // Text fields by role, not getByLabel: in Playwright's Firefox, resolving
  // a name through a label or aria-labelledby and then running axe crashes the
  // page (a SIGSEGV in the content process), whatever the page.
  const textbox = (name: string | RegExp) =>
    page.getByRole('textbox', typeof name === 'string' ? { name, exact: true } : { name });
  const configName = textbox(/^Config name/);
  const fileInput = page.locator('input[type=file]');
  const menuItem = (text: RegExp) =>
    page.locator('[focusgroup] button, [role=menuitem]', { hasText: text }).first();
  /** The phone layout's top bar menu, which holds what the wide bar shows as buttons. */
  const more = page.getByRole('button', { name: 'More', exact: true });
  /** The phone layout's key sheet. */
  const sheet = page.getByRole('dialog', { name: /^Key \d+$/ });
  return {
    page,
    tiles,
    keyGrid,
    configName,
    fileInput,
    button,
    menuItem,
    unsaved: page.getByText('Unsaved changes', { exact: true }),
    more,
    sheet,
    /** The Keys | Channels switch of the phone layout. */
    screenTab: (name: 'Keys' | 'Channels') => page.getByRole('tab', { name, exact: true }),
    label: textbox('Label'),
    sessions: page.getByRole('list', { name: 'Your sessions' }),
    /** The wordmark, which goes back to Home. */
    home: button(/Home$/),
    /** A channel's chip, which picks it for the selected key. */
    pick: (n: number) => page.getByRole('button', { name: new RegExp(`^Channels? ${n}\\b`) }),
    typeButton: (key: number, type: string) =>
      page
        .getByRole('group', { name: `Key ${key} type` })
        .getByRole('button', { name: type, exact: true }),
    channelName: (n: number) => textbox(`Channel ${n} name`),
    tileName: (i: number) => tiles.nth(i).getAttribute('aria-label'),
    /**
     * A top bar command by its button's name (`Show me around`, `Undo (⌘Z)`,
     * `Home`…): the button on a wide bar, the item in the More menu on a phone.
     */
    async command(name: string | RegExp) {
      if (await more.isVisible()) {
        await more.click();
        const by = typeof name === 'string' ? { name, exact: true } : { name };
        // A menu item is a button in a native focusgroup, or a menuitem where there's none.
        await page
          .getByRole('menuitem', by)
          .or(page.locator('[focusgroup~="menu"]').getByRole('button', by))
          .filter({ visible: true })
          .first()
          .click();
      } else if (name === 'Home') {
        await button(/Home$/).click();
      } else {
        await button(name).click();
      }
    },
    /** Back to Home: the wordmark, or on a phone the menu's Home. */
    async goHome() {
      await this.command('Home');
      await expect(page.getByRole('button', { name: 'Start new' })).toBeVisible();
    },
    /** From Home, start a blank system. */
    async startNew() {
      await button('Start new').click();
      await expect(keyGrid).toBeVisible();
    },
    /** Open the JOSEPH fixtures (from Home or the editor) and wait for them. */
    async openJoseph() {
      await fileInput.setInputFiles(JOSEPH);
      await expect(configName).toHaveValue('JOSEPH');
      await page
        .getByRole('button', { name: 'Dismiss notification' })
        .first()
        .click({ timeout: 1000 })
        .catch(() => {});
    },
    /** Export one file from the Export menu and save it under `dir`. */
    async save(row: RegExp, dir: string): Promise<{ path: string; name: string }> {
      await button(/^Export/).click();
      const [dl] = await Promise.all([page.waitForEvent('download'), menuItem(row).click()]);
      const path = join(dir, dl.suggestedFilename());
      await dl.saveAs(path);
      return { path, name: dl.suggestedFilename() };
    },
  };
};

export type Editor = ReturnType<typeof editorOf>;

export interface Options {
  /** Whether the tour counts as already seen (default true), so it doesn't start by itself. */
  readonly tourSeen: boolean;
}

export const test = base.extend<Options & { editor: Editor }>({
  tourSeen: [true, { option: true }],
  page: async ({ page, tourSeen }, use) => {
    if (tourSeen) {
      await page.addInitScript((key) => {
        try {
          localStorage.setItem(key, 'done');
        } catch {}
      }, TOUR_KEY);
    }
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text());
    });
    await page.goto('/');
    await use(page);
    expect(errors, 'no page errors').toEqual([]);
  },
  editor: async ({ page }, use) => {
    await use(editorOf(page));
  },
});

/** A fresh temporary directory for downloads and made-up files. */
export const scratch = (): string => mkdtempSync(join(tmpdir(), 'me1-mate-e2e-'));

/** A file that isn't a config, for the "couldn't open" path. */
export const brokenFile = (): string => {
  const path = join(scratch(), 'BROKEN.ME1');
  writeFileSync(path, Buffer.from('not a config'));
  return path;
};

/** Whether the page fits the window without scrolling. */
export const fits = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);
