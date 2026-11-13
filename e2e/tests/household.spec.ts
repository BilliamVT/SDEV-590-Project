import { type Browser, type Page, expect, test } from '@playwright/test';

import { addTask, createHousehold, inviteCode, joinHousehold, register, today } from './helpers';

/** Pat creates a household and Sam joins it from another browser session, as on another phone. */
async function patAndSam(page: Page, browser: Browser): Promise<Page> {
  await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');
  const code = await inviteCode(page);

  const sam = await (await browser.newContext()).newPage();
  await register(sam, 'Sam');
  await joinHousehold(sam, code);
  await expect(sam.getByText('Maple Street')).toBeVisible();
  return sam;
}

test('members share the schedule and see who did what', async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);

  await addTask(page, 'Vacuum', 'Every day');

  // Sam sees Pat's task and does it
  await sam.reload();
  await today(sam).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(sam).getByText('✓ Done by Sam')).toBeVisible();

  // Pat sees it was Sam
  await page.reload();
  await expect(today(page).getByText('✓ Done by Sam')).toBeVisible();
  await expect(today(page).getByRole('button', { name: 'Undo Vacuum' })).toBeVisible();
  await sam.context().close();
});

test('a member renames the household for everyone', async ({ page, browser }) => {
  const sam = await patAndSam(page, browser);

  await sam.getByRole('link', { name: 'Settings' }).click();
  await sam.getByRole('button', { name: 'Rename' }).click();
  const name = sam.getByLabel('Household name');
  await expect(name).toHaveValue('Maple Street');
  await name.fill('The Burrow');
  await sam.getByRole('button', { name: 'Save' }).click();
  await expect(sam.getByText('The Burrow')).toBeVisible();

  await page.reload();
  await expect(page.getByText('The Burrow')).toBeVisible();
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

  await joinHousehold(sam, newCode);
  await expect(sam.getByText('Maple Street')).toBeVisible();
  await sam.context().close();
});
