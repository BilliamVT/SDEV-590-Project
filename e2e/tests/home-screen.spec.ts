import { expect, test } from '@playwright/test';

import { expectInstallable } from '../shared/home-screen';
import { signUpWithHousehold } from './helpers';

test('the app can be added to a home screen (BILLIAMVT-53)', async ({ page, request }) => {
  await page.goto('/');

  await expectInstallable(page, request);
  // Full screen on phones with a notch; the styles keep content in the safe area
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
});

test("a week that didn't load can be tried again, with no reload button (BILLIAMVT-53)", async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await expect(page.locator('.day')).toHaveCount(7);

  // The backend can't be reached (e.g. still waking up) when the app comes back into view
  await page.route('**/api/schedule**', (route) => route.abort());
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByRole('alert').filter({ hasText: "couldn't be reached" })).toBeVisible();

  await page.unroute('**/api/schedule**');
  await page.getByRole('button', { name: 'Try again' }).first().click();
  await expect(page.locator('.day')).toHaveCount(7);
  await expect(page.getByRole('alert').filter({ hasText: "couldn't be reached" })).toHaveCount(0);
});
