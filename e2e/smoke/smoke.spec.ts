import { expect, test } from '@playwright/test';

/**
 * After each deploy: production works in a real browser, not just its health check (BILLIAMVT-48).
 * Read-only. The smoke household has no tasks, so viewing its week generates nothing.
 */
const email = process.env['SMOKE_TEST_EMAIL'];
const password = process.env['SMOKE_TEST_PASSWORD'];
const name = process.env['SMOKE_TEST_NAME'] ?? 'Smoke Test';
const household = process.env['SMOKE_TEST_HOUSEHOLD'] ?? 'Smoke test';
const backend = process.env['SMOKE_BACKEND_URL'] ?? 'https://sdev-590-project.onrender.com';

test.beforeAll(async ({ request }) => {
  expect(email, 'Set SMOKE_TEST_EMAIL (a GitHub secret in CI)').toBeTruthy();
  expect(password, 'Set SMOKE_TEST_PASSWORD (a GitHub secret in CI)').toBeTruthy();
  // Wake the backend first, so the browser steps don't wait on a cold start
  await expect
    .poll(
      async () => {
        try {
          return (await request.get(`${backend}/actuator/health`, { timeout: 30_000 })).status();
        } catch {
          return 0;
        }
      },
      { message: 'The backend is up', timeout: 150_000, intervals: [5_000] },
    )
    .toBe(200);
});

test('a member can log in, see their week and household, and log out', async ({ page }) => {
  // Not logged in, so the app sends us to the login page
  await page.goto('./');
  const emailField = page.getByLabel('Email');
  await expect(emailField).toHaveClass(/ng-pristine|ng-dirty/);
  await emailField.fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Log in' }).click();

  // Home: the welcome and the week, which needs the household
  await expect(page.getByText(`Welcome, ${name}.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'This week' })).toBeVisible();
  await expect(page.locator('.day.today')).toBeVisible();

  // Settings: the account's household
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.locator('.setting .name')).toHaveText(household);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
});
