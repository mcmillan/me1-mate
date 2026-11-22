import { expect, test } from './helpers.ts';

test.beforeEach(async ({ editor }) => {
  await editor.startNew();
});

test('picking channels for keys, from scratch @desktop', async ({ editor }) => {
  const { pick, tiles } = editor;
  await pick(5).click();
  await expect(tiles.nth(0), 'an empty key becomes a channel key').toHaveAttribute(
    'aria-label',
    /channel 5\b/,
  );
  await expect(editor.unsaved).toBeVisible();
  await expect(pick(5), 'the picked channel is pressed').toHaveAttribute('aria-pressed', 'true');

  await editor.channelName(5).fill('Kick');
  await expect(tiles.nth(0), 'the key shows its channel name').toHaveAttribute(
    'aria-label',
    /Kick/,
  );

  await pick(7).click();
  await expect(tiles.nth(0), 'another pick switches a channel key').toHaveAttribute(
    'aria-label',
    /channel 7\b/,
  );
  await expect(pick(5)).toHaveAttribute('aria-pressed', 'false');

  await editor.typeButton(1, 'Group').click();
  await pick(5).click();
  await pick(9).click();
  await expect(tiles.nth(0), 'a group collects picks').toHaveAttribute('aria-label', /3 channels/);
  await pick(9).click();
  await expect(tiles.nth(0), 'picking a member again removes it').toHaveAttribute(
    'aria-label',
    /2 channels/,
  );

  await tiles.nth(1).click();
  await editor.typeButton(2, 'Group').click();
  await pick(5).click();
  await expect(tiles.nth(0), 'a channel moves between groups').toHaveAttribute(
    'aria-label',
    /1 channel\b/,
  );
  await expect(tiles.nth(1)).toHaveAttribute('aria-label', /1 channel\b/);

  await editor.button('Link channels 5 and 6 as a stereo pair').click();
  await expect(editor.channelName(5), 'a linked pair has one name field').toBeVisible();
  await expect(editor.channelName(6)).toHaveCount(0);
  await expect(editor.button(/^Channels 5–6/), 'a linked pair picks as one').toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await editor.button(/^Undo/).click();
  await expect(editor.channelName(6), 'unlinking brings the second name back').toBeVisible();

  // Each key and its channels share a colour.
  const bg = (loc: typeof tiles) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  const k1 = await bg(tiles.nth(0));
  const k2 = await bg(tiles.nth(1));
  expect(k1, 'assigned keys have their own colours').not.toBe(k2);
  expect(k1).not.toMatch(/rgba\(0, 0, 0, 0\)/);
  expect(await bg(pick(7)), "a channel wears its key's colour").toBe(k1);
  expect(await bg(pick(5))).toBe(k2);
  expect([k1, k2], 'an unused channel has no colour').not.toContain(await bg(pick(20)));
});

test('undoing back to where you started is not unsaved work @desktop', async ({ editor }) => {
  await editor.tiles.nth(0).click();
  await editor.pick(6).click();
  await expect(editor.unsaved, 'an edit is unsaved').toBeVisible();
  await editor.button(/^Undo/).click();
  await expect(editor.unsaved, 'undoing it clears the marker').toBeHidden();
});

test('linking a pair keeps the key on it @desktop', async ({ editor, page }) => {
  await editor.tiles.nth(0).click();
  await editor.pick(6).click();
  await editor.button('Link channels 5 and 6 as a stereo pair').click();
  await expect(editor.button(/^Channels 5–6/)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /problem/ })).toBeHidden();
});

test('arrow keys move through the key grid as it is laid out on screen', async ({
  editor,
  page,
}) => {
  // The grid is 2×8 on a wide window and narrower on a phone; the arrows
  // follow what's on screen, so the expected key is the one below key 2.
  const boxes = await editor.tiles.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y) };
    }),
  );
  const key2 = boxes[1];
  if (!key2) throw new Error('no key 2');
  const below = boxes
    .map((b, i) => ({ ...b, i }))
    .filter((b) => Math.abs(b.x - key2.x) < 2 && b.y > key2.y)
    .sort((a, b) => a.y - b.y)[0];
  if (!below) throw new Error('nothing below key 2');

  await editor.tiles.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(editor.tiles.nth(1)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(editor.tiles.nth(below.i)).toHaveAttribute('aria-checked', 'true');
});

test('the desktop key grid puts key 10 below key 2 @desktop', async ({ editor, page }) => {
  await editor.tiles.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(editor.tiles.nth(9)).toHaveAttribute('aria-checked', 'true');
});
