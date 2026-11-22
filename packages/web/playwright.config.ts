import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the production build, served by `vite preview`.
 * Run with `pnpm e2e` from the repo root (it builds the core first).
 *
 * Projects: three desktop engines at 1280×720 and two phones (touch,
 * `hover: none`). Tests tagged `@desktop` need a wide window and run only in
 * the desktop projects; tests tagged `@touch` only in the phone projects.
 *
 * Locally it runs gently: Chromium only, two tests at a time, so the machine
 * stays usable. `pnpm e2e:all` (E2E_ALL=1) brings in every project, which CI
 * always has.
 */
const PORT = 4317;
const CI = Boolean(process.env.CI);
const ALL = CI || Boolean(process.env.E2E_ALL);
const desktop = { viewport: { width: 1280, height: 720 } };

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results/output',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 2,
  reporter: CI
    ? [['github'], ['html', { outputFolder: 'e2e-results/report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'e2e-results/report', open: 'never' }]],
  expect: { timeout: 5000 },
  use: {
    baseURL: `http://localhost:${PORT}/`,
    acceptDownloads: true,
    // Tests see the build as served, not a cached copy; offline.spec.ts,
    // which tests the service worker, turns it back on.
    serviceWorkers: 'block',
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
  ].filter((project) => ALL || project.name === 'chromium'),
  webServer: {
    // What ships: a production build, served as Pages would serve it.
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
