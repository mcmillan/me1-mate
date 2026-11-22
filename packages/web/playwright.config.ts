import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build, served by `vite preview`.
 * Run with `pnpm e2e` from the repo root (it builds the core first).
 *
 * Projects: three desktop engines at 1280×720 and two phones (touch,
 * `hover: none`). Tests tagged `@desktop` need a wide window and run only in
 * the desktop projects; tests tagged `@touch` only in the phone projects.
 */
const PORT = 4317;
const CI = Boolean(process.env.CI);
const desktop = { viewport: { width: 1280, height: 720 } };

export default defineConfig({
  testDir: 'e2e',
  // Real VoiceOver runs on its own: playwright.voiceover.config.ts.
  testIgnore: 'voiceover.spec.ts',
  outputDir: 'e2e-results/output',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  reporter: CI
    ? [['github'], ['html', { outputFolder: 'e2e-results/report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'e2e-results/report', open: 'never' }]],
  expect: { timeout: 5000 },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...desktop },
      grepInvert: /@touch/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], ...desktop },
      grepInvert: /@touch/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], ...desktop },
      grepInvert: /@touch/,
    },
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'] },
      grepInvert: /@desktop/,
    },
    {
      name: 'pixel',
      use: { ...devices['Pixel 7'] },
      grepInvert: /@desktop/,
    },
  ],
  webServer: {
    // What ships: a production build, served as Pages would serve it.
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
