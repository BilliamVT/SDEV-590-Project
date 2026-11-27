import { type Browser, type Page, expect, test } from '@playwright/test';

import { addBacklogItem, addTask, backlog, backlogItem, confirmSheet, createHousehold, expectHousehold, formReady, inviteCode, joinHousehold, joinHouseholdNamed, openMenu, openSettings, register, today } from './helpers';

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
 * Assigning (BILLIAMVT-64): a whole task when adding it, then a single day from its ⋯ menu. Both
 * members see who it's for; once done, the day shows who actually did it.
 */
test('a task is assigned to a member, and one day to someone else', async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);

  await page.getByRole('link', { name: 'Housework Scheduler' }).click();
  await page.getByRole('link', { name: 'Add a task' }).click();
  const taskName = page.getByLabel('Task', { exact: true });
  await formReady(taskName);
  await taskName.fill('Vacuum');
  await page.getByLabel('Repeats').selectOption({ label: 'Every day' });
  await page.getByLabel('Assigned to').selectOption({ label: 'Sam' });
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(today(page).locator('.assignee')).toHaveText('Assigned to Sam');

  // Pat takes today's
  await openMenu(today(page), 'Vacuum');
  await page.getByRole('button', { name: 'Assign: Vacuum' }).click();
  await confirmSheet(page).getByRole('radio', { name: 'Pat' }).check();
  await confirmSheet(page).getByRole('button', { name: 'Assign' }).click();
  await expect(page.locator('.toast')).toContainText('Vacuum on');
  await expect(today(page).locator('.assignee')).toHaveText('Assigned to Pat');

  // Undo puts the day back to following the task; then Pat takes it again
  await page.locator('.toast').getByRole('button', { name: /^Undo: Vacuum on/ }).click();
  await expect(page.locator('.toast')).toContainText('back to Sam');
  await expect(today(page).locator('.assignee')).toHaveText('Assigned to Sam');
  await openMenu(today(page), 'Vacuum');
  await page.getByRole('button', { name: 'Assign: Vacuum' }).click();
  await confirmSheet(page).getByRole('radio', { name: 'Pat' }).check();
  await confirmSheet(page).getByRole('button', { name: 'Assign' }).click();
  await expect(today(page).locator('.assignee')).toHaveText('Assigned to Pat');

  // Sam sees it's Pat's today, and the task is still Sam's
  await sam.reload();
  await expect(today(sam).locator('.assignee')).toHaveText('Assigned to Pat');
  await sam.getByRole('link', { name: 'Your tasks' }).click();
  await expect(sam.locator('.task').filter({ hasText: 'Vacuum' }).locator('.assignee')).toHaveText('Assigned to Sam');
  await sam.locator('.task').filter({ hasText: 'Vacuum' }).getByRole('link', { name: 'Edit' }).click();
  await expect(sam.getByLabel('Assigned to').locator('option:checked')).toHaveText('Sam');

  // Done: who did it replaces who it was for
  await page.reload();
  await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeVisible();
  await expect(today(page).locator('.assignee')).toHaveCount(0);

  // A backlog item is for Sam before it has a day, and its day follows
  await addBacklogItem(page, 'Hang shelves');
  await openMenu(backlog(page), 'Hang shelves');
  await backlog(page).getByRole('button', { name: 'Assign: Hang shelves' }).click();
  await confirmSheet(page).getByRole('radio', { name: 'Sam' }).check();
  await confirmSheet(page).getByRole('button', { name: 'Assign' }).click();
  await expect(backlogItem(page, 'Hang shelves').locator('.assignee')).toHaveText('Assigned to Sam');
  await backlog(page).getByRole('button', { name: 'Schedule Hang shelves' }).click();
  await backlog(page).getByRole('button', { name: 'Add to day' }).click();
  await expect(today(page).locator('.occurrence').filter({ hasText: 'Hang shelves' }).locator('.assignee')).toHaveText(
    'Assigned to Sam',
  );
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
