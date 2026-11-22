import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { type Editor, expect, test } from './helpers.ts';

/**
 * Accessibility, automated: an axe scan of each screen and state (in both
 * colour schemes, so contrast is checked in each), in every engine. Each scan
 * also saves a screenshot in the test's output folder, for looking at the page
 * in every engine.
 *
 * Pages are scanned at rest: entrance animations finished, the pointer off the
 * page's controls, and (outside dialogs) nothing focused. Pointing at a key
 * fades the channels it doesn't play to 35% opacity, on purpose and only while
 * pointing, so that state is left out of the contrast check.
 */
const scan = async (page: Page, info: TestInfo, name: string, { blur = true } = {}) => {
  const { width, height } = page.viewportSize() ?? { width: 1, height: 1 };
  await page.mouse.move(width - 1, height - 1);
  if (blur) await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Time-based animations only: a scroll-driven one never finishes.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter(
            (a) =>
              a.timeline === document.timeline &&
              a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
          )
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((done) => setTimeout(done, 5000)),
    ]),
  );
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  const all = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .disableRules(['target-size'])
    .analyze();
  // A channel's key markers are drawn small but hit through an absolutely
  // placed ::after that makes the target at least 24×24 (44×38 on a phone);
  // axe measures only the box, so they're left out here and layout.spec.ts
  // checks their real hit area. Every other target is held to 24×24.
  const sizes = await new AxeBuilder({ page })
    .withRules(['target-size'])
    .exclude('.ch-tag')
    .analyze();
  const violations = [...all.violations, ...sizes.violations];
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations on ${name}`).toEqual([]);
};

const toTour = async (editor: Editor) => {
  await editor.startNew();
  await editor.command('Show me around');
  await expect(editor.page.getByRole('dialog').filter({ visible: true })).toBeVisible();
};

const toDeleteDialog = async (editor: Editor) => {
  await editor.button('Try the example').click();
  await editor.goHome();
  await editor.sessions
    .getByRole('button', { name: /^Delete / })
    .first()
    .click();
  await expect(editor.page.getByRole('dialog', { name: 'Delete this session?' })).toBeVisible();
};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`Home, ${scheme}`, async ({ page }, info) => {
      await scan(page, info, `home-${scheme}`);
    });

    test(`Home with a session, ${scheme}`, async ({ editor, page }, info) => {
      await editor.button('Try the example').click();
      await editor.goHome();
      await expect(editor.sessions).toBeVisible();
      await scan(page, info, `home-sessions-${scheme}`);
    });

    test(`the editor with the example, ${scheme}`, async ({ editor, page }, info) => {
      await editor.button('Try the example').click();
      await expect(editor.tiles.nth(0)).toHaveAttribute('aria-label', /Drums/);
      await scan(page, info, `editor-example-${scheme}`);
    });

    test(`the editor with the fixtures, a group selected, ${scheme}`, async ({
      editor,
      page,
    }, info) => {
      await editor.openJoseph();
      await editor.tiles.nth(1).click();
      await scan(page, info, `editor-fixtures-${scheme}`);
    });

    test(`the editor showing a problem, ${scheme}`, async ({ editor, page }, info) => {
      await editor.openJoseph();
      await editor.tiles.nth(1).click();
      await editor.label.fill('Pc!');
      await editor.label.press('Tab');
      await expect(page.getByText(/Key 2's label/).filter({ visible: true })).not.toHaveCount(0);
      await scan(page, info, `editor-problem-${scheme}`);
    });

    test(`the phone's Channels screen, ${scheme} @touch`, async ({ editor, page }, info) => {
      await editor.openJoseph();
      await editor.screenTab('Channels').click();
      await expect(editor.channelName(1)).toBeVisible();
      await scan(page, info, `phone-channels-${scheme}`);
    });

    test(`the tour, ${scheme}`, async ({ editor, page }, info) => {
      await toTour(editor);
      await scan(page, info, `tour-${scheme}`, { blur: false });
    });

    test(`the delete dialog, ${scheme}`, async ({ editor, page }, info) => {
      await toDeleteDialog(editor);
      await scan(page, info, `delete-dialog-${scheme}`, { blur: false });
    });
  });
}
