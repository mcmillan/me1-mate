import { expect, TOUR_KEY, test } from './helpers.ts';

test('the tour walks from the keys to export and changes nothing', async ({ editor, page }) => {
  await editor.startNew();
  await editor.button('Show me around').click();
  const step = page.getByRole('dialog').filter({ visible: true });
  await expect(step, 'it opens on the keys').toContainText('16 keys');
  for (let i = 0; i < 3; i++) await step.getByRole('button', { name: 'Next' }).click();
  await expect(step, 'it ends at export').toContainText(/export/i);
  await step.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog').filter({ visible: true }), 'Done closes it').toHaveCount(0);
  await expect(editor.unsaved, 'the tour made no edit').toBeHidden();
});

test.describe('first visit', () => {
  test.use({ tourSeen: false });

  test('the tour starts by itself the first time, and not again', async ({ editor, page }) => {
    await expect(page.getByRole('dialog').filter({ visible: true })).toHaveCount(0);
    await editor.startNew();
    const step = page.getByRole('dialog').filter({ visible: true });
    await expect(step).toContainText('16 keys');
    await step.getByRole('button', { name: /Skip/ }).click();
    await expect(step).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), TOUR_KEY)).toBe('done');
    await editor.home.click();
    await editor.startNew();
    await expect(page.getByRole('dialog').filter({ visible: true })).toHaveCount(0);
  });
});
