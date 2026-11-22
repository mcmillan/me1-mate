import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '@mcmillan/me1-mate-core';
import type { Page } from '@playwright/test';
import {
  differences,
  expect,
  FIXTURES,
  fits,
  JOSEPH,
  josephWith,
  ME1_AT,
  scratch,
  test,
} from './helpers.ts';

/**
 * The phone layout: the key grid is the home screen, a key opens in a sheet
 * with its channel picker, and channels are named on a screen of their own.
 */

/** How far the page runs on past the end of its content. */
const spaceBelow = (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) return Number.POSITIVE_INFINITY;
    return document.documentElement.scrollHeight - (main.getBoundingClientRect().bottom + scrollY);
  });

test('a key opens in its sheet, where its channels are picked @touch', async ({ editor, page }) => {
  await editor.startNew();
  const { tiles, sheet, pick } = editor;
  await tiles.nth(0).click();
  await expect(sheet, 'tapping a key opens its sheet').toBeVisible();
  await expect(sheet).toHaveAccessibleName('Key 1');

  await pick(5).click();
  await expect(pick(5), 'the picked channel is pressed').toHaveAttribute('aria-pressed', 'true');
  await expect(tiles.nth(0), 'an empty key becomes a channel key').toHaveAttribute(
    'aria-label',
    /channel 5\b/,
  );
  await pick(7).click();
  await expect(pick(5)).toHaveAttribute('aria-pressed', 'false');
  await editor.typeButton(1, 'Group').click();
  await pick(5).click();
  await pick(9).click();
  await expect(tiles.nth(0), 'a group collects picks').toHaveAttribute('aria-label', /3 channels/);
  await expect(pick(9), 'the tile says which key plays it').toHaveAccessibleName(
    /played by key 01/,
  );

  await sheet.getByRole('button', { name: 'Next key' }).click();
  await expect(sheet, '› steps to the next key').toHaveAccessibleName('Key 2');
  await expect(editor.typeButton(2, 'Empty')).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Previous key' }).click();
  await expect(sheet, '‹ steps back').toHaveAccessibleName('Key 1');
  await sheet.getByRole('button', { name: 'Next key' }).click();

  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet, 'Done closes it').toBeHidden();
  await expect(tiles.nth(1), 'and the key it ended on has focus').toBeFocused();
  await expect(tiles.nth(1)).toHaveAttribute('aria-checked', 'true');

  await tiles.nth(2).click();
  await expect(sheet).toHaveAccessibleName('Key 3');
  await page.keyboard.press('Escape');
  await expect(sheet, 'Escape closes it').toBeHidden();
  await expect(tiles.nth(2)).toBeFocused();
});

test('channels are named and linked on their own screen @touch', async ({ editor, page }) => {
  await editor.startNew();
  await editor.tiles.nth(0).click();
  await editor.pick(5).click();
  await editor.sheet.getByRole('button', { name: 'Done' }).click();

  await editor.screenTab('Channels').click();
  await expect(editor.screenTab('Channels')).toHaveAttribute('aria-selected', 'true');
  await expect(editor.keyGrid, 'the keys give way to the channels').toBeHidden();
  await expect(
    page.getByRole('tabpanel', { name: 'Channels' }),
    'the screen is the tab’s panel',
  ).toBeVisible();
  await expect(editor.pick(1), 'nothing is picked here').toHaveCount(0);

  await editor.channelName(5).fill('Kick');
  await editor.button('Link channels 7 and 8 as a stereo pair').click();
  await expect(editor.channelName(8), 'a linked pair has one name').toHaveCount(0);

  await page.getByRole('button', { name: /^Used by key 01, Kick: open it/ }).click();
  await expect(editor.sheet, "a key's marker opens the key").toHaveAccessibleName('Key 1');
  await expect(editor.pick(5)).toHaveAccessibleName(/Kick/);
  await expect(editor.button(/^Channels 7–8/), 'the pair picks as one').toBeVisible();
  await editor.sheet.getByRole('button', { name: 'Done' }).click();

  await editor.screenTab('Keys').click();
  await editor.screenTab('Keys').focus();
  await page.keyboard.press('ArrowRight');
  await expect(editor.screenTab('Channels'), 'arrow keys move along the tabs').toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(editor.channelName(5)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(editor.screenTab('Keys')).toBeFocused();
  await expect(editor.keyGrid).toBeVisible();
  await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /Kick/);
});

test('the menu holds undo, redo, open, new, the tour and home @touch', async ({ editor, page }) => {
  await editor.startNew();
  await expect(editor.button(/^Undo/), 'the bar itself is calm').toBeHidden();
  await editor.tiles.nth(0).click();
  await editor.pick(6).click();
  await editor.sheet.getByRole('button', { name: 'Done' }).click();
  await expect(editor.unsaved).toBeAttached();

  await editor.command('Undo (⌘Z)');
  await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /unassigned/);
  await editor.command('Redo (⇧⌘Z)');
  await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /channel 6\b/);

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    editor.command('Open files'),
  ]);
  await chooser.setFiles(JOSEPH);
  await expect(editor.configName).toHaveValue('JOSEPH');

  await editor.command('Start new');
  await expect(editor.configName).toHaveValue('NEWMIX');
  await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /unassigned/);

  await editor.command('Show me around');
  const step = page.getByRole('dialog').filter({ visible: true });
  await expect(step).toContainText('16 keys');
  await step.getByRole('button', { name: /Skip/ }).click();

  await editor.goHome();
  await expect(editor.sessions.getByRole('button', { name: /^Open JOSEPH/ })).not.toHaveCount(0);
});

test('the tour points at what a phone shows @touch', async ({ editor, page }) => {
  await editor.startNew();
  await editor.screenTab('Channels').click();
  await editor.command('Show me around');
  const step = page.getByRole('dialog').filter({ visible: true });
  /** The element the step is tethered to (named --tour), which must be on screen. */
  const target = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll<HTMLElement>('body *')].find(
        (e) => getComputedStyle(e).getPropertyValue('anchor-name') === '--tour',
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cls: el.className,
        onScreen: r.width > 0 && r.bottom > 0 && r.top < innerHeight,
      };
    });

  await expect(step).toContainText('16 keys');
  await expect(editor.keyGrid, 'the tour starts on the key screen').toBeVisible();
  expect(await target()).toMatchObject({ cls: expect.stringContaining('workspace-keys') });
  await step.getByRole('button', { name: 'Next' }).click();
  await expect(step).toContainText('switch to Channels');
  expect(await target()).toMatchObject({ cls: 'top-switch', onScreen: true });
  await step.getByRole('button', { name: 'Next' }).click();
  await expect(step).toContainText('The key you open');
  expect(await target()).toMatchObject({ onScreen: true });
  await step.getByRole('button', { name: 'Next' }).click();
  await expect(step).toContainText(/export/i);
  expect(await target()).toMatchObject({
    cls: expect.stringContaining('top-export'),
    onScreen: true,
  });
  await step.getByRole('button', { name: 'Done' }).click();
  await expect(step).toHaveCount(0);
});

test('a problem in the list opens the key at the field @touch', async ({ editor, page }) => {
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  await editor.label.fill('Pc!');
  await editor.label.press('Tab');
  await expect(
    page
      .getByText(/Key 2's label/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await editor.sheet.getByRole('button', { name: 'Done' }).click();
  await expect(editor.tiles.nth(1), 'the key shows it has a problem').toHaveAttribute(
    'aria-label',
    /1 problem/,
  );

  await editor.tiles.nth(5).click();
  await editor.sheet.getByRole('button', { name: 'Done' }).click();
  await editor.button(/^1 problem/).click();
  await editor.menuItem(/Key 2's label/).click();
  await expect(editor.sheet, "the key's sheet opens").toHaveAccessibleName('Key 2');
  await expect(editor.label, 'at the field').toBeFocused();
  await editor.label.fill('Perc');
  await editor.sheet.getByRole('button', { name: 'Done' }).click();
  await expect(editor.button(/problem/), 'fixed, the count goes').toHaveCount(0);
});

test('the key screen fits the window and no screen runs on past its end @touch', async ({
  editor,
  page,
}) => {
  await editor.startNew();
  expect(await fits(page), 'the blank key screen fits').toBe(true);
  await editor.openJoseph();
  expect(await fits(page), 'the loaded key screen fits').toBe(true);
  await editor.screenTab('Channels').click();
  expect(await spaceBelow(page), 'nothing below the channels').toBeLessThanOrEqual(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await page.getByRole('group', { name: 'Channels 39 and 40' }).boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  expect((last?.y ?? 0) + (last?.height ?? 0), 'the last pair ends at the foot').toBeGreaterThan(
    height - 80,
  );

  await editor.screenTab('Keys').click();
  await editor.tiles.nth(0).click();
  const sheet = await editor.sheet.evaluate(async (el) => {
    // Once it has risen into place.
    await Promise.all(el.getAnimations().map((a) => a.finished.catch(() => {})));
    const r = el.getBoundingClientRect();
    el.scrollTop = el.scrollHeight;
    const tiles = [...el.querySelectorAll('.ch-pick')];
    const end = tiles.at(-1)?.getBoundingClientRect().bottom ?? 0;
    return { top: r.top, bottom: r.bottom, below: r.bottom - end, vh: innerHeight };
  });
  expect(sheet.bottom, 'the sheet reaches the bottom of the window').toBeCloseTo(sheet.vh, 0);
  expect(sheet.top, 'and nearly the top').toBeLessThan(60);
  expect(sheet.below, 'it ends with its last channel').toBeLessThan(60);
});

/** How far the key grid ends above the bottom of the window, and whether the page scrolls. */
const keyScreen = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('.kg-rows')?.getBoundingClientRect();
    return {
      gap: innerHeight - (grid?.bottom ?? 0),
      scrolls: document.documentElement.scrollHeight > innerHeight,
    };
  });

test('the key screen fills the window, upright and on its side @touch', async ({
  editor,
  page,
}) => {
  await editor.openJoseph();
  const upright = page.viewportSize();
  if (!upright) throw new Error('no viewport');
  const tall = await keyScreen(page);
  expect(tall.scrolls, 'upright, nothing scrolls').toBe(false);
  expect(tall.gap, 'upright, the keys reach the foot of the window').toBeLessThanOrEqual(16);

  await page.setViewportSize({ width: upright.height, height: upright.width });
  await expect(editor.screenTab('Keys'), 'on its side it is still the phone layout').toBeVisible();
  const wide = await keyScreen(page);
  expect(wide.scrolls, 'on its side, nothing scrolls').toBe(false);
  expect(wide.gap, 'on its side, the keys reach the foot too').toBeLessThanOrEqual(16);
  const rows = await editor.tiles.evaluateAll(
    (tiles) => new Set(tiles.map((t) => t.getBoundingClientRect().top)).size,
  );
  expect(rows, 'two rows of eight, as on the ME-1').toBe(2);
});

test('the key sheet offers Aux In, Tone, a balance, member pans and mute @touch', async ({
  editor,
  page,
}) => {
  const orig = readFileSync(join(FIXTURES, 'JOSEPH.ME1'));
  await editor.openJoseph();
  const { tiles, sheet } = editor;

  await tiles.nth(13).click();
  await editor.typeButton(14, 'Aux In').click();
  await expect(sheet.getByText(/plays the Aux Input, so it takes no channels/)).toBeVisible();
  await editor.mute(14).click();
  await expect(editor.mute(14)).toHaveAttribute('aria-pressed', 'true');
  const balance = editor.slider('Key 14 balance');
  await balance.focus();
  for (let i = 0; i < 3; i++) await balance.press('ArrowRight');
  await expect(balance).toHaveAttribute('aria-valuetext', 'right 3');
  await sheet.getByRole('button', { name: 'Next key' }).click();
  await editor.typeButton(15, 'Tone').click();
  await expect(editor.slider(/^Key 15 (pan|balance)$/)).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(tiles.nth(13)).toHaveAttribute('aria-label', /Aux In, the Aux Input.*muted/);
  await expect(tiles.nth(14)).toHaveAttribute('aria-label', /Tone/);

  await tiles.nth(0).click();
  const snare = editor.slider(/^Snare 2 pan in key 1$/);
  await snare.focus();
  await snare.press('Home');
  await expect(snare).toHaveAttribute('aria-valuetext', 'left 37');
  const centre = sheet.getByRole('button', { name: /^Centre snare 2 pan/ });
  await expect(centre, 'Centre shows at rest where there is no hover').toBeVisible();
  await snare.press('ArrowRight');
  await expect(snare).toHaveAttribute('aria-valuetext', 'left 36');
  await sheet.getByRole('button', { name: 'Done' }).click();

  const me1 = readFileSync((await editor.save(/Config for the ME-1/, scratch())).path);
  const back = parseConfig({ me1, meu: readFileSync(join(FIXTURES, 'JOSEPH.meu'), 'utf8') });
  if (!back.isOk) throw new Error(`export doesn't parse back: ${JSON.stringify(back.error)}`);
  expect(back.value.keys[13]).toMatchObject({ type: 'aux', pan: 40, muted: true });
  expect(back.value.keys[14]).toMatchObject({ type: 'tone' });
  expect(me1[ME1_AT.sendPan(0, 1)], "the snare's pan").toBe(1);
  expect(
    differences(me1, orig).filter((i) => i < ME1_AT.flags(13)),
    'keys 1–13 change only in the snare pan',
  ).toEqual([ME1_AT.sendPan(0, 1)]);
  await expect(page.getByRole('dialog', { name: /^Key/ })).toBeHidden();
});

test('a pan problem in the list opens the key at its pan @touch', async ({ editor }) => {
  await editor.fileInput.setInputFiles(josephWith({ [ME1_AT.sendPan(0, 1)]: 90 }));
  await expect(editor.configName).toHaveValue('JOSEPH');
  await editor.button(/^1 problem/).click();
  await editor.menuItem(/Key 1's pan for channel 2 must be/).click();
  await expect(editor.sheet).toHaveAccessibleName('Key 1');
  await expect(editor.slider(/^Channel 2 pan in key 1$/)).toBeFocused();
});

test('exports from a phone are byte-exact apart from the edits @touch', async ({ editor }) => {
  const dir = scratch();
  await editor.openJoseph();
  await editor.tiles.nth(0).click();
  await editor.label.fill('Drums');
  await editor.sheet.getByRole('button', { name: 'Done' }).click();
  await editor.screenTab('Channels').click();
  await editor.channelName(18).fill('BassDI');
  const me1 = await editor.save(/Config for the ME-1/, dir);
  const meu = await editor.save(/Channel setup for the ME-U/, dir);
  expect([me1.name, meu.name]).toEqual(['JOSEPH.ME1', 'ChannelSetup.meu']);

  const back = parseConfig({ me1: readFileSync(me1.path), meu: readFileSync(meu.path, 'utf8') });
  if (!back.isOk) throw new Error(`exports don't parse back: ${JSON.stringify(back.error)}`);
  expect((back.value.keys[0] as { name?: string }).name).toBe('Drums');
  expect(back.value.channels[17]?.name).toBe('BassDI');
  const orig = readFileSync(join(FIXTURES, 'JOSEPH.ME1'));
  const out = readFileSync(me1.path);
  const changed = [...out.keys()].filter((i) => out[i] !== orig[i]);
  expect(
    changed.filter((i) => i < 0xcc || i > 0xd3),
    'only key 1 name bytes changed',
  ).toEqual([]);
});
