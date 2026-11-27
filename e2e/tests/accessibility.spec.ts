import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { addBacklogItem, addTask, backlog, confirmSheet, openMenu, openSettings, register, today } from './helpers';

/*
 * Automated accessibility check (BILLIAMVT-49): axe-core looks at every page, in light and dark
 * mode, for problems such as low contrast, missing labels or a broken heading order. Serious and
 * critical problems fail the test; the report names the rule, the element and how to fix it.
 * It can't judge everything (e.g. whether a label makes sense), so it complements, not replaces,
 * trying the app on a phone.
 */
async function expectAccessible(page: Page, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(serious, `${name}:\n  ${serious.join('\n  ')}`).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('every page is accessible', async ({ page }) => {
      await page.goto('/login');
      await expectAccessible(page, 'Log in');
      await page.goto('/register');
      await expectAccessible(page, 'Register');

      await register(page, 'Pat');
      await expectAccessible(page, 'Set up your household');
      await page.getByRole('button', { name: 'Create household' }).click();
      await expect(page.getByRole('button', { name: 'Previous week' })).toBeVisible();

      // The home page with something in every state: pending, done, a one-off item, the backlog
      await addTask(page, 'Vacuum', 'Every day');
      await addBacklogItem(page, 'Hang shelves');
      await addBacklogItem(page, 'Clean gutters');
      await page.getByRole('button', { name: 'Schedule Clean gutters' }).click();
      await page.getByRole('button', { name: 'Add to day' }).click();
      await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
      await expect(today(page).getByText('Done by Pat')).toBeVisible();
      await expectAccessible(page, 'Home');

      // Another week, with Back to this week showing (BILLIAMVT-58)
      await page.getByRole('button', { name: 'Next week' }).click();
      await expect(page.getByRole('button', { name: 'Back to this week' })).toBeVisible();
      await expectAccessible(page, 'Home, next week');
      await page.getByRole('button', { name: 'Back to this week' }).click();
      await expect(today(page).getByText('Done by Pat')).toBeVisible();

      // A ⋯ menu open, then the action sheet
      await openMenu(today(page), 'Vacuum');
      await expectAccessible(page, 'Home, menu open');
      // The menu floats over the rows below it; Escape closes it, as a tap elsewhere would
      await page.keyboard.press('Escape');
      await expect(page.locator('.popover-menu')).toHaveCount(0);
      await openMenu(backlog(page), 'Hang shelves');
      await expectAccessible(page, 'Home, backlog menu open');
      await page.keyboard.press('Escape');
      await expect(page.locator('.popover-menu')).toHaveCount(0);
      await openMenu(today(page), 'Clean gutters');
      await today(page).getByRole('button', { name: 'Delete: Clean gutters' }).click();
      await expect(confirmSheet(page)).toBeVisible();
      await expectAccessible(page, 'Home, action sheet');
      await confirmSheet(page).getByRole('button', { name: 'Cancel' }).click();
      // The move sheet, with its day picker (BILLIAMVT-56)
      await openMenu(today(page), 'Clean gutters');
      await today(page).getByRole('button', { name: 'Move: Clean gutters' }).click();
      await expect(confirmSheet(page).getByLabel('New day')).toBeVisible();
      await expectAccessible(page, 'Home, move sheet');
      await confirmSheet(page).getByRole('button', { name: 'Cancel' }).click();

      await page.goto('/tasks');
      await expect(page.getByText('Vacuum')).toBeVisible();
      await expectAccessible(page, 'Your tasks');

      await page.getByRole('link', { name: 'Edit' }).click();
      await expect(page.getByLabel('Task', { exact: true })).toHaveValue('Vacuum');
      await expectAccessible(page, 'Edit task');

      await page.goto('/tasks/new');
      await expectAccessible(page, 'New task');

      await page.goto('/');
      await openSettings(page);
      await expect(page.getByText('The server and database are running.')).toBeVisible();
      await expectAccessible(page, 'Settings');
    });
  });
}
