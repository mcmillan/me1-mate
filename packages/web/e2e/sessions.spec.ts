import { expect, test } from './helpers.ts';

test('sessions are kept as you go, listed on Home and reopened @desktop', async ({
  editor,
  page,
}) => {
  await editor.startNew();
  await editor.pick(5).click();
  await editor.openJoseph();
  await editor.tiles.nth(2).click();
  await editor.label.fill('Bass2');
  await page.waitForTimeout(800);
  await page.reload();
  await expect(editor.sessions, 'Home lists past sessions').toBeVisible();
  await expect(
    editor.sessions.getByRole('button', { name: /^Open NEWMIX/ }),
    'the scratch session was kept when files were opened',
  ).not.toHaveCount(0);
  await editor.sessions
    .getByRole('button', { name: /^Open JOSEPH/ })
    .first()
    .click();
  await expect(editor.configName).toHaveValue('JOSEPH');
  await editor.tiles.nth(2).click();
  await expect(editor.label, 'reopening a session brings its edits back').toHaveValue('Bass2');
  await expect(editor.unsaved, 'and it is still unsaved').toBeVisible();
});

test('New starts at once and keeps the old session; a session can be deleted @desktop', async ({
  editor,
  page,
}) => {
  await editor.openJoseph();
  await editor.button('New').click();
  await expect(page.getByRole('dialog'), 'New never asks').toHaveCount(0);
  await expect(editor.unsaved).toBeHidden();
  await editor.tiles.nth(0).click();
  await editor.typeButton(1, 'Auto').click();
  await editor.configName.fill('SCRATCH');
  await editor.goHome();
  await expect(
    editor.sessions.getByRole('button', { name: /^Open JOSEPH/ }),
    'the system New left is still listed',
  ).not.toHaveCount(0);

  await editor.sessions
    .getByRole('button', { name: /^Delete SCRATCH/ })
    .first()
    .click();
  const del = page.getByRole('dialog', { name: 'Delete this session?' });
  await del.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(del).toBeHidden();
  await expect(editor.sessions.getByRole('button', { name: /^Open SCRATCH/ })).toHaveCount(0);
  await expect(editor.sessions.getByRole('button', { name: /^Open JOSEPH/ })).toHaveCount(1);
});

test('a blank system is not kept as a session', async ({ editor, page }) => {
  await editor.button('Try the example').click();
  await editor.goHome();
  const items = editor.sessions.getByRole('listitem');
  await expect(items).toHaveCount(1);
  await editor.startNew();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(items).toHaveCount(1);
});

test('delete buttons show at rest where there is no hover @touch', async ({ editor }) => {
  await editor.button('Try the example').click();
  await editor.goHome();
  await expect(editor.sessions.getByRole('button', { name: /^Delete / })).toHaveCSS('opacity', '1');
});
