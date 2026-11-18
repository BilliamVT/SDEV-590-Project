import { type Browser, type Page, expect, test } from '@playwright/test';

import { addTask, confirmSheet, createHousehold, expectHousehold, inviteCode, joinHousehold, joinHouseholdNamed, openMenu, openSettings, register, today } from './helpers';

/** Pat creates a household and Sam joins it from another browser session, as on another phone. */
async function patAndSam(page: Page, browser: Browser): Promise<Page> {
  await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');
  const code = await inviteCode(page);

  const sam = await (await browser.newContext()).newPage();
  await register(sam, 'Sam');
  await joinHouseholdNamed(sam, code, 'Maple Street');
  return sam;
}

test('members share the schedule and see who did what', async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);

  await page.getByRole('link', { name: 'Housework Scheduler' }).click();
  await addTask(page, 'Vacuum', 'Every day');

  // Sam sees Pat's task and does it
  await sam.reload();
  await today(sam).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(sam).getByText('Done by Sam')).toBeVisible();

  // Pat sees it was Sam
  await page.reload();
  await expect(today(page).getByText('Done by Sam')).toBeVisible();
  await expect(today(page).getByRole('button', { name: 'Undo Vacuum' })).toBeVisible();
  await sam.context().close();
});

/**
 * Two phones on the same week (BILLIAMVT-55, decision record 0007): coming back to the app shows
 * what changed, and acting on something that already changed reloads the week and says so,
 * naming the member only when the app knows for certain who did it.
 */
test("a member's screen catches up with the other's changes", async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);
  await page.getByRole('link', { name: 'Housework Scheduler' }).click();
  await addTask(page, 'Vacuum', 'Every day');
  await addTask(page, 'Dishes', 'Every day');
  await addTask(page, 'Laundry', 'Every day');
  await sam.reload();
  await expect(today(sam).getByText('Laundry')).toBeVisible();

  // Sam marks Vacuum done; Pat's screen still shows it to do, and Pat taps it
  await today(sam).getByRole('button', { name: /^Mark Vacuum done/ }).click();
  await expect(today(sam).getByText('Done by Sam')).toBeVisible();
  await today(page).getByRole('button', { name: /^Mark Vacuum done/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sam already marked Vacuum done. Your week is up to date.' })).toBeVisible();
  await expect(today(page).getByText('Done by Sam')).toBeVisible();

  // Sam deletes today's Dishes; Pat taps it: removed, so nobody is named
  await openMenu(today(sam), 'Dishes');
  await today(sam).getByRole('button', { name: /^Delete: Dishes/ }).click();
  await confirmSheet(sam).getByRole('button', { name: 'Delete' }).click();
  await expect(today(sam).getByText('Dishes')).toBeHidden();
  await today(page).getByRole('button', { name: /^Mark Dishes done/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Dishes was already removed. Your week is up to date.' })).toBeVisible();
  await expect(today(page).getByText('Dishes')).toBeHidden();

  // Sam skips Laundry; Pat comes back to the app and sees it, with no notice
  await openMenu(today(sam), 'Laundry');
  await today(sam).getByRole('button', { name: 'Skip Laundry' }).click();
  await expect(today(sam).getByText('Skipped by Sam')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(today(page).getByText('Skipped by Sam')).toBeVisible();
  await expect(page.locator('.week .notice')).toHaveCount(0);
  await sam.context().close();
});

test('a member renames the household for everyone', async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);

  await openSettings(sam);
  await sam.getByRole('button', { name: 'Rename' }).click();
  const name = sam.getByLabel('Household name');
  await expect(name).toHaveValue('Maple Street');
  await name.fill('The Burrow');
  await sam.getByRole('button', { name: 'Save' }).click();
  await expect(sam.locator('.setting .name')).toHaveText('The Burrow');

  await page.reload();
  await expect(page.locator('.setting .name')).toHaveText('The Burrow');
  await sam.context().close();
});

test('a new invite code stops the old one working', async ({ page, browser }) => {
  await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');
  const oldCode = await inviteCode(page);

  await page.getByRole('button', { name: 'New code' }).click();
  await expect(page.locator('.invite code')).not.toHaveText(oldCode);
  const newCode = await inviteCode(page);

  const sam = await (await browser.newContext()).newPage();
  await register(sam, 'Sam');
  await joinHousehold(sam, oldCode);
  await expect(sam.getByRole('alert')).toHaveText('No household has that invite code');

  await joinHouseholdNamed(sam, newCode, 'Maple Street');
  await expectHousehold(sam, 'Maple Street', ['Pat', 'Sam']);
  await sam.context().close();
});
