import { expect, fits, test } from './helpers.ts';

test('opens on the home screen with three ways in', async ({ editor }) => {
  await expect(editor.button('Open files')).toBeVisible();
  await expect(editor.button('Start new')).toBeVisible();
  await expect(editor.button('Try the example')).toBeVisible();
  await expect(editor.sessions, 'no sessions listed yet').toHaveCount(0);
});

test('blank home fits 1280×720 @desktop', async ({ page }) => {
  expect(await fits(page)).toBe(true);
});

test('the example opens a filled-in system, and Home lists it', async ({ editor }) => {
  await editor.button('Try the example').click();
  await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /Drums/);
  await editor.goHome();
  await expect(editor.sessions).toBeVisible();
  await expect(editor.sessions.getByRole('listitem')).toHaveCount(1);
});

test('Start new opens the editor: 16 keys, channels and inspector on one page @desktop', async ({
  editor,
  page,
}) => {
  await editor.startNew();
  await expect(editor.tiles).toHaveCount(16);
  await expect(editor.channelName(40)).toBeAttached();
  await expect(page.getByRole('group', { name: 'Key 1 type' })).toBeVisible();
  await expect(editor.unsaved, 'a blank page has no unsaved marker').toBeHidden();
  await expect(editor.fileInput, 'one file input').toHaveCount(1);
});

test('the blank editor fits 1280×720, keys in the 2×8 layout @desktop', async ({
  editor,
  page,
}) => {
  await editor.startNew();
  await expect(editor.channelName(40)).toBeVisible();
  expect(await fits(page), 'blank page fits without scrolling').toBe(true);
  const [k1, k8, k9] = await Promise.all([0, 7, 8].map((i) => editor.tiles.nth(i).boundingBox()));
  expect(k8?.y, 'keys 1–8 on one row').toBe(k1?.y);
  expect(k9?.y, '9 starts the next').toBeGreaterThan(k1?.y ?? 0);
  expect(Math.abs((k9?.x ?? 0) - (k1?.x ?? 0))).toBeLessThan(1);
});

test('the page is set in Allo', async ({ editor, page }) => {
  await editor.startNew();
  const allo = await page.evaluate(async () => {
    await document.fonts.ready;
    const tile = document.querySelector('[role=radio]');
    return (
      [...document.fonts].some(
        (f) => f.family.replace(/"/g, '') === 'Allo' && f.status === 'loaded',
      ) &&
      tile !== null &&
      getComputedStyle(tile).fontFamily.replace(/"/g, '').startsWith('Allo')
    );
  });
  expect(allo).toBe(true);
});
