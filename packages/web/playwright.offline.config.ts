import { defineConfig, devices } from '@playwright/test';

/**
 * The offline and crawlable-page checks, against a production build served by
 * `vite preview` (the service worker only exists in a build). Needs the core
 * package built first (`pnpm -r build`); then:
 *
 *   pnpm --filter @mcmillan/me1-mate-web e2e:offline
 */
const PORT = 4178;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['offline.spec.ts', 'page.spec.ts'],
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite build && vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
