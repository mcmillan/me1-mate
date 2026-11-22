import { withGuidepup } from '@guidepup/playwright';
import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * Real VoiceOver, driven by Guidepup, on macOS only: `pnpm e2e:voiceover`.
 * CI runs it on a macOS runner after `guidepup setup --ci`; on your own Mac it
 * needs VoiceOver set up for automation first (it takes over the screen
 * reader while it runs). One test at a time, in a headed WebKit.
 */
export default defineConfig(
  withGuidepup({
    ...base,
    testMatch: 'voiceover.spec.ts',
    testIgnore: [],
    timeout: 3 * 60_000,
    retries: base.retries,
    reportSlowTests: null,
    reporter: process.env.CI
      ? [['github'], ['html', { outputFolder: 'e2e-results/voiceover-report', open: 'never' }]]
      : [['list']],
    outputDir: 'e2e-results/voiceover-output',
    projects: [{ name: 'voiceover', use: { ...devices['Desktop Safari'] } }],
  }),
);
