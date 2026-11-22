import { voiceOverTest } from '@guidepup/playwright';
import { editorOf, expect, TOUR_KEY } from './helpers.ts';

/**
 * Real VoiceOver on macOS, through Guidepup: what someone using it hears on
 * the main journeys. Run by `playwright.voiceover.config.ts` (CI's macOS job),
 * never in the main suite. VoiceOver's wording varies between macOS releases,
 * so the checks look for names, roles and states, not exact sentences.
 */
const test = voiceOverTest.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((key) => localStorage.setItem(key, 'done'), TOUR_KEY);
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('main').waitFor();
    await use(page);
  },
});

test.describe.configure({ mode: 'serial' });

/** Move VoiceOver on until it says something matching, or give up. */
const findSaid = async (
  voiceOver: { next(): Promise<void>; lastSpokenPhrase(): Promise<string> },
  pattern: RegExp,
  limit = 40,
) => {
  for (let i = 0; i < limit; i++) {
    if (pattern.test(await voiceOver.lastSpokenPhrase())) return;
    await voiceOver.next();
  }
  throw new Error(`VoiceOver never said ${pattern}`);
};

/** Wait until VoiceOver's log has something matching. */
const heard = (voiceOver: { spokenPhraseLog(): Promise<string[]> }, pattern: RegExp) =>
  expect
    .poll(async () => (await voiceOver.spokenPhraseLog()).join('\n'), { timeout: 15_000 })
    .toMatch(pattern);

test('Home, the example, and a key are heard', async ({ page, voiceOver }) => {
  const editor = editorOf(page);
  await voiceOver.navigateToWebContent();
  await findSaid(voiceOver, /Try the example.*button|button.*Try the example/i);
  await voiceOver.act();
  await expect(editor.keyGrid).toBeVisible();
  await editor.tiles.nth(0).focus();
  await heard(voiceOver, /Key 1: Drums/);
  await page.keyboard.press('ArrowRight');
  await heard(voiceOver, /Key 2: /);
});

test('the delete dialog is heard, and Escape closes it', async ({ page, voiceOver }) => {
  const editor = editorOf(page);
  await editor.button('Try the example').click();
  await editor.home.click();
  await voiceOver.navigateToWebContent();
  const del = editor.sessions.getByRole('button', { name: /^Delete / }).first();
  await del.focus();
  await page.keyboard.press('Enter');
  await heard(voiceOver, /Delete this session\?/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Delete this session?' })).toBeHidden();
  await expect(del).toBeFocused();
});
