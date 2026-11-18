import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deploy smoke test against production (BILLIAMVT-48): `npx playwright test -c smoke.config.ts`.
 *
 * Read-only: it logs in with a dedicated account whose household has no tasks, looks, and logs
 * out. It never registers, creates or changes anything. The account's email and password come
 * from SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD (GitHub secrets in CI; never commit them).
 */
const ci = !!process.env['CI'];

export default defineConfig({
  testDir: './smoke',
  forbidOnly: ci,
  // One retry, so a slow wake-up or a Pages cache delay shows as flaky rather than failed
  retries: ci ? 1 : 0,
  // The free Render instance can take about a minute to wake up
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    // The trailing slash matters: pages are reached relative to the repo path on GitHub Pages
    baseURL: process.env['SMOKE_BASE_URL'] ?? 'https://billiamvt.github.io/SDEV-590-Project/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // WebKit is the engine behind Safari and every iPhone browser, which the household uses
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
});
