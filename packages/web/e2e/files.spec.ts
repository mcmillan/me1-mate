import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig, parseME1Config } from '@mcmillan/me1-mate-core';
import {
  brokenFile,
  differences,
  expect,
  FIXTURES,
  fits,
  josephWith,
  ME1_AT,
  scratch,
  test,
} from './helpers.ts';

test('opening files over unsaved work never asks, and loads them @desktop', async ({
  editor,
  page,
}) => {
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

test('typing in one field undoes in one step, and redoes @desktop', async ({ editor }) => {
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

test('an invalid label is explained, blocks export, and the problems list finds it @desktop', async ({
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

test('exports are byte-exact apart from the edits @desktop', async ({ editor }) => {
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

test('an untouched export is identical to the file loaded @desktop', async ({ editor }) => {
  const dir = scratch();
  await editor.openJoseph();
  await editor.tiles.nth(1).click();
  const me1 = await editor.save(/Config for the ME-1/, dir);
  const meu = await editor.save(/Channel setup for the ME-U/, dir);
  expect(readFileSync(me1.path).equals(readFileSync(join(FIXTURES, 'JOSEPH.ME1')))).toBe(true);
  expect(readFileSync(meu.path).equals(readFileSync(join(FIXTURES, 'JOSEPH.meu')))).toBe(true);
});

test('selecting keys and tabbing around makes no edit @desktop', async ({ editor, page }) => {
  await editor.openJoseph();
  for (const i of [3, 8, 15, 0]) await editor.tiles.nth(i).click();
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  await expect(editor.unsaved).toBeHidden();
});

test('a new system exports and parses @desktop', async ({ editor }) => {
  await editor.startNew();
  await editor.tiles.nth(0).click();
  await editor.typeButton(1, 'Auto').click();
  await editor.configName.fill('SCRATCH');
  const fresh = await editor.save(/Config for the ME-1/, scratch());
  expect(fresh.name).toBe('SCRATCH.ME1');
  const back = parseME1Config(readFileSync(fresh.path));
  expect(back.isOk && back.value.keys[0]?.type).toBe('auto');
});

test('a key switched to Aux In or Tone takes no channels and exports a file the core reads @desktop', async ({
  editor,
  page,
}) => {
  await editor.openJoseph();
  await editor.tiles.nth(13).click();
  await editor.typeButton(14, 'Aux In').click();
  await expect(editor.typeButton(14, 'Aux In')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/is the Aux Input, so it takes no channels/)).toBeVisible();
  await expect(editor.pick(5), 'picking is off').toHaveAttribute('aria-disabled', 'true');
  await expect(editor.slider('Key 14 balance'), 'the Aux Input has a balance').toBeVisible();
  await editor.tiles.nth(14).click();
  await editor.typeButton(15, 'Tone').click();
  await expect(editor.slider(/^Key 15 (pan|balance)$/), 'a tone has no pan').toHaveCount(0);
  await expect(editor.tiles.nth(14)).toHaveAttribute('aria-label', /Tone, a 1 kHz test tone/);
  await expect(editor.tiles.nth(13)).toHaveAttribute('aria-label', /Aux In, the Aux Input/);

  const me1 = await editor.save(/Config for the ME-1/, scratch());
  const back = parseME1Config(readFileSync(me1.path));
  if (!back.isOk) throw new Error(`export doesn't parse back: ${JSON.stringify(back.error)}`);
  expect(back.value.keys[13]).toMatchObject({ type: 'aux' });
  expect(back.value.keys[14]).toMatchObject({ type: 'tone' });
  expect(back.value.keys[15]?.type, 'the other keys are as they were').toBe('auto');
});

test('panning a key and a group member changes only their pan bytes; Centre puts one back @desktop', async ({
  editor,
}) => {
  const dir = scratch();
  const orig = readFileSync(join(FIXTURES, 'JOSEPH.ME1'));
  await editor.openJoseph();
  await editor.tiles.nth(2).click();
  const pan = editor.slider('Key 3 pan');
  await pan.focus();
  for (let i = 0; i < 5; i++) await pan.press('ArrowLeft');
  await expect(pan).toHaveAttribute('aria-valuetext', 'left 5');
  await editor.button(/^Undo/).click();
  await expect(pan, 'the presses undo in one step').toHaveAttribute('aria-valuetext', 'centre');
  await editor.button(/^Redo/).click();
  await expect(pan).toHaveAttribute('aria-valuetext', 'left 5');

  await editor.tiles.nth(0).click();
  const kick = editor.slider(/^Kick 1 pan in key 1$/);
  await kick.focus();
  await kick.press('End');
  await expect(kick).toHaveAttribute('aria-valuetext', 'right 37');

  const first = readFileSync((await editor.save(/Config for the ME-1/, dir)).path);
  expect(differences(first, orig), 'only the two pan bytes changed').toEqual([
    ME1_AT.sendPan(0, 0),
    ME1_AT.pan(2),
  ]);
  expect([first[ME1_AT.sendPan(0, 0)], first[ME1_AT.pan(2)]]).toEqual([74, 32]);

  await editor.tiles.nth(2).click();
  await editor.button('Centre key 3 pan').click();
  await expect(pan).toHaveAttribute('aria-valuetext', 'centre');
  const second = readFileSync((await editor.save(/Config for the ME-1/, scratch())).path);
  expect(differences(second, orig), "the key's pan is back as it was").toEqual([
    ME1_AT.sendPan(0, 0),
  ]);
});

test('muting a key marks its tile and exports only the mute bit @desktop', async ({ editor }) => {
  await editor.openJoseph();
  await editor.tiles.nth(2).click();
  await expect(editor.mute(3)).toHaveAttribute('aria-pressed', 'false');
  await editor.mute(3).click();
  await expect(editor.mute(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.tiles.nth(2), 'the tile says so').toHaveAttribute('aria-label', /muted/);
  await expect(editor.tiles.nth(2).getByText('Muted')).toBeVisible();

  const me1 = readFileSync((await editor.save(/Config for the ME-1/, scratch())).path);
  const orig = readFileSync(join(FIXTURES, 'JOSEPH.ME1'));
  expect(differences(me1, orig)).toEqual([ME1_AT.flags(2)]);
  const back = parseME1Config(me1);
  expect(back.isOk && back.value.keys[2]).toMatchObject({ type: 'channel', muted: true });

  await editor.mute(3).click();
  await expect(editor.tiles.nth(2)).not.toHaveAttribute('aria-label', /muted/);
});

test('a pan the ME-1 can’t store is explained and the problems list jumps to it @desktop', async ({
  editor,
  page,
}) => {
  await editor.fileInput.setInputFiles(josephWith({ [ME1_AT.pan(2)]: 100 }));
  await expect(editor.configName).toHaveValue('JOSEPH');
  await editor.button(/^1 problem/).click();
  await editor.menuItem(/Key 3's pan must be from L 37 to R 37/).click();
  await expect(editor.slider('Key 3 pan'), 'the problems list lands on the pan').toBeFocused();
  await expect(
    page
      .getByText(/Key 3's pan must be/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await editor.button('Centre key 3 pan').click();
  await expect(editor.button(/problem/), 'centring fixes it').toHaveCount(0);
});

test('the level fader tops out at the most an ME-1 saves @desktop', async ({ editor }) => {
  await editor.openJoseph();
  await editor.tiles.nth(2).click();
  const level = editor.slider('Key 3 level');
  await level.focus();
  await level.press('End');
  await expect(level).toHaveAttribute('aria-valuetext', '+9.6 dB');
  const readout = editor.textbox('Key 3 level in dB');
  await readout.focus();
  await expect(readout).toBeFocused();
  await readout.fill('10');
  await expect(readout).toHaveValue('10');
  await readout.press('Enter');
  await expect(readout, 'a typed +10 is held at the top').toHaveValue('+9.6');
  const me1 = readFileSync((await editor.save(/Config for the ME-1/, scratch())).path);
  expect([me1[ME1_AT.level(2)], me1[ME1_AT.level(2) + 1]], 'the raw level an ME-1 saves').toEqual([
    0xff, 0x9f,
  ]);
  expect(parseME1Config(me1).isOk).toBe(true);
});

test("a broken file is explained, not asked about, and the work's still there @desktop", async ({
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
