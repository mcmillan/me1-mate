import { expect, TOUR_KEY, test } from './helpers.ts';

test('the tour walks from the keys to export and changes nothing', async ({ editor, page }) => {
  await editor.startNew();
  await editor.command('Show me around');
  const step = page.locator('dialog.tour-step').filter({ visible: true });
  await expect(step, 'it opens on the keys').toContainText('16 keys');
  // Four steps on the one page; on a phone, more (a key's page has a step for each part).
  const done = step.getByRole('button', { name: 'Done', exact: true });
  for (let i = 0; i < 10 && !(await done.isVisible()); i++) {
    await step.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(step, 'it ends at export').toContainText(/export/i);
  await step.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog').filter({ visible: true }), 'Done closes it').toHaveCount(0);
  await expect(
    page.getByRole('dialog', { name: /^Key \d+$/ }),
    'and no key’s page is open',
  ).toBeHidden();
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
    await editor.goHome();
    await editor.startNew();
    await expect(page.getByRole('dialog').filter({ visible: true })).toHaveCount(0);
  });
});
