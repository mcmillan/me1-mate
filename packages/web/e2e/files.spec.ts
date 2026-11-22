import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, parseME1Config } from '@mcmillan/me1-mate-core';
import { brokenFile, expect, FIXTURES, fits, scratch, test } from './helpers.ts';

test('opening files over unsaved work never asks, and loads them', async ({ editor, page }) => {
  await editor.startNew();
  await editor.pick(5).click();
  await expect(editor.unsaved).toBeVisible();
  await editor.openJoseph();
  await expect(page.getByRole('dialog', { name: 'Replace the current system?' })).toHaveCount(0);
  await expect(editor.configName, 'config name from the file').toHaveValue('JOSEPH');
  await expect(editor.channelName(7), "a pair's first name is shown").toHaveValue('KitPad');
  await expect(editor.channelName(8), 'and its second is not').toHaveCount(0);
});

test('the loaded editor fits 1280×720, inspector beside the keys @desktop', async ({
  editor,
  page,
}) => {
  await editor.openJoseph();
  expect(await fits(page), 'loaded page fits without scrolling').toBe(true);
  await editor.tiles.nth(1).click();
  expect(await fits(page), 'the 8-channel group still fits').toBe(true);
  const [k, insp, ch] = await Promise.all([
    editor.keyGrid.boundingBox(),
    page.getByRole('group', { name: 'Key 2 type' }).boundingBox(),
    editor.channelName(1).boundingBox(),
  ]);
  if (!k || !insp || !ch) throw new Error('a region is missing');
  expect(insp.x, 'inspector beside the keys').toBeGreaterThan(k.x + k.width);
  expect(ch.y, 'channels under the keys').toBeGreaterThan(k.y + k.height);
  expect(ch.x).toBeLessThan(insp.x);
});

test('typing in one field undoes in one step, and redoes', async ({ editor }) => {
  await editor.openJoseph();
  await editor.tiles.nth(0).click();
  const before = await editor.label.inputValue();
  await editor.label.fill('Drums');
  await expect(editor.unsaved, 'unsaved after an edit').toBeVisible();
  await editor.label.fill('Drm');
  await editor.button(/^Undo/).click();
  await expect(editor.label).toHaveValue(before);
  await editor.button(/^Redo/).click();
  await expect(editor.label).toHaveValue('Drm');
});

test('an invalid label is explained, blocks export, and the problems list finds it', async ({
  editor,
  page,
}) => {
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  await editor.label.fill('Pc!');
  const problem = page
    .getByText(/Key 2's label/)
    .filter({ visible: true })
    .first();
  await expect(problem, 'no error while still typing').toBeHidden();
  await editor.label.press('Tab');
  await expect(problem, 'shown in plain English after leaving the field').toBeVisible();
  await editor.button(/^Export/).click();
  await expect(page.getByText(/Fix 1 problem/), 'export says why it is blocked').toBeVisible();
  await page.keyboard.press('Escape');
  await editor.button(/^1 problem/).click();
  await editor.menuItem(/Key 2's label/).click();
  await expect(editor.label, 'the problems list jumps to the field').toBeFocused();
});

test('exports are byte-exact apart from the edits', async ({ editor }) => {
  const dir = scratch();
  await editor.openJoseph();
  await editor.tiles.nth(0).click();
  await editor.label.fill('Drums');
  await editor.channelName(18).fill('BassDI');
  const me1 = await editor.save(/Config for the ME-1/, dir);
  await expect(editor.unsaved, 'exporting only the .ME1 leaves the rename unsaved').toBeVisible();
  const meu = await editor.save(/Channel setup for the ME-U/, dir);
  expect([me1.name, meu.name], 'download names').toEqual(['JOSEPH.ME1', 'ChannelSetup.meu']);
  await expect(editor.unsaved, 'the marker clears after export').toBeHidden();

  const back = parseConfig({ me1: readFileSync(me1.path), meu: readFileSync(meu.path, 'utf8') });
  if (!back.isOk) throw new Error(`exports don't parse back: ${JSON.stringify(back.error)}`);
  expect((back.value.keys[0] as { name?: string }).name, 'edits persisted').toBe('Drums');
  expect(back.value.channels[17]?.name).toBe('BassDI');
  expect(back.value.channels[7]?.name, "a pair's hidden second name survives").toBe('PadR');

  const orig = readFileSync(join(FIXTURES, 'JOSEPH.ME1'));
  const out = readFileSync(me1.path);
  expect(out.length).toBe(orig.length);
  const changed = [...out.keys()].filter((i) => out[i] !== orig[i]);
  expect(changed.length, 'the .ME1 changed').toBeGreaterThan(0);
  expect(
    changed.filter((i) => i < 0xcc || i > 0xd3),
    'only key 1 name bytes changed',
  ).toEqual([]);
});

test('an untouched export is identical to the file loaded', async ({ editor }) => {
  const dir = scratch();
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  const me1 = await editor.save(/Config for the ME-1/, dir);
  const meu = await editor.save(/Channel setup for the ME-U/, dir);
  expect(readFileSync(me1.path).equals(readFileSync(join(FIXTURES, 'JOSEPH.ME1')))).toBe(true);
  expect(readFileSync(meu.path).equals(readFileSync(join(FIXTURES, 'JOSEPH.meu')))).toBe(true);
});

test('selecting keys and tabbing around makes no edit', async ({ editor, page }) => {
  await editor.openJoseph();
  for (const i of [3, 8, 15, 0]) await editor.tiles.nth(i).click();
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  await expect(editor.unsaved).toBeHidden();
});

test('a new system exports and parses', async ({ editor }) => {
  await editor.startNew();
  await editor.tiles.nth(0).click();
  await editor.typeButton(1, 'Auto').click();
  await editor.configName.fill('SCRATCH');
  const fresh = await editor.save(/Config for the ME-1/, scratch());
  expect(fresh.name).toBe('SCRATCH.ME1');
  const back = parseME1Config(readFileSync(fresh.path));
  expect(back.isOk && back.value.keys[0]?.type).toBe('auto');
});

test("a broken file is explained, not asked about, and the work's still there", async ({
  editor,
  page,
}) => {
  await editor.startNew();
  await editor.tiles.nth(0).click();
  await editor.pick(6).click();
  await editor.fileInput.setInputFiles(brokenFile());
  await expect(page.getByText(/Couldn.t open/).first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Replace the current system?' })).toHaveCount(0);
  await expect(editor.pick(6)).toHaveAttribute('aria-pressed', 'true');
});
