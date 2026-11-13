import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real stack: Postgres, the backend with its `local` profile, and
 * the Angular dev server (BILLIAMVT-47). Never production.
 *
 * Locally, servers already running on 8080 and 4200 are reused (and left running); missing ones
 * are started and stopped again. In CI the job starts Postgres and both servers are started here.
 */
const ci = !!process.env['CI'];

export default defineConfig({
  testDir: './tests',
  // Each test registers its own users, so tests can run in parallel
  fullyParallel: true,
  forbidOnly: ci,
  // One retry in CI, so a flaky test shows as flaky instead of failing the PR
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // WebKit is the engine behind Safari and every iPhone browser, which the household mostly uses
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: [
    {
      // CI runs the jar it just built; locally the backend starts the way the README describes
      command: process.env['E2E_BACKEND_COMMAND'] ?? 'mvn -q spring-boot:run',
      cwd: '../backend',
      url: 'http://localhost:8080/actuator/health',
      reuseExistingServer: !ci,
      timeout: 180_000,
    },
    {
      command: 'npx ng serve --port 4200',
      cwd: '../frontend',
      url: 'http://localhost:4200',
      reuseExistingServer: !ci,
      timeout: 180_000,
    },
  ],
});
