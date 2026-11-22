import { expect, test } from './helpers.ts';

const sheetOf = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Keyboard shortcuts' });

test('? opens the keyboard shortcuts, and Escape or Done closes them @desktop', async ({
  editor,
  page,
}) => {
  await editor.startNew();
  await editor.tiles.nth(0).focus();
  await page.keyboard.press('?');
  const sheet = sheetOf(page);
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Undo');
  await expect(sheet).toContainText('Level to 0 dB');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(editor.tiles.nth(0), 'focus goes back where it was').toBeFocused();

  await page.keyboard.press('?');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
});

test('typing ? in a field types it, and Home has no shortcuts sheet @desktop', async ({
  editor,
  page,
}) => {
  await page.keyboard.press('?');
  await expect(sheetOf(page), 'not on Home').toBeHidden();
  await editor.startNew();
  await editor.configName.focus();
  await page.keyboard.press('?');
  await expect(sheetOf(page)).toBeHidden();
});
