import { expect, test } from '@playwright/test';

import { addBacklogItem, addTask, backlog, backlogItem, confirmSheet, day, openMenu, signUpWithHousehold, today, weekLoaded } from './helpers';

test('a new daily task shows today, and can be marked done and undone', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  await addTask(page, 'Vacuum', 'Every day');

  await expect(page.getByRole('status')).toContainText('Saved: Vacuum, every day.');
  await expect(today(page).getByText('Vacuum')).toBeVisible();

  await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeVisible();

  await today(page).getByRole('button', { name: 'Undo Vacuum' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeHidden();
  await expect(today(page).getByRole('button', { name: 'Mark Vacuum done' })).toBeVisible();
});

test('a weekly task on several days shows on exactly those days', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  // Chosen out of order: the app sorts them
  await addTask(page, 'Laundry', 'Every week', ['Thursday', 'Monday']);
  await expect(page.getByRole('status')).toContainText('Saved: Laundry, every week on Monday and Thursday.');

  // Next week is entirely in the future, so each chosen day has its occurrence whatever today is
  await page.getByRole('button', { name: /^Next/ }).click();
  await weekLoaded(page);
  for (const name of ['Monday', 'Thursday']) {
    await expect(day(page, name).getByText('Laundry')).toBeVisible();
  }
  for (const name of ['Sunday', 'Tuesday', 'Wednesday', 'Friday', 'Saturday']) {
    await expect(day(page, name).getByText('Laundry')).toHaveCount(0);
  }
});

test('a backlog item can be put on today and sent back to the backlog', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addBacklogItem(page, 'Hang shelves');

  // The day picker starts on today
  await backlog(page).getByRole('button', { name: 'Schedule Hang shelves' }).click();
  await backlog(page).getByRole('button', { name: 'Add to day' }).click();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();

  // On the schedule, a one-off item has Done, and Back to backlog and Delete under ⋯, but no Skip
  await expect(today(page).getByText('Hang shelves')).toBeVisible();
  await openMenu(today(page), 'Hang shelves');
  await expect(today(page).getByRole('button', { name: 'Skip Hang shelves' })).toHaveCount(0);

  // Back to the backlog is easy to reverse, so it doesn't ask first (BILLIAMVT-49)
  await today(page).getByRole('button', { name: 'Back to backlog: Hang shelves' }).click();
  await expect(today(page).getByText('Hang shelves', { exact: true })).toBeHidden();
  await expect(backlogItem(page, 'Hang shelves')).toBeVisible();
});

test('a day of a recurring task can be skipped and undone, or deleted after confirming in an action sheet', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  // Skip and Delete are under ⋯; the circle marks it done or undoes it (BILLIAMVT-49)
  await openMenu(today(page), 'Vacuum');
  await today(page).getByRole('button', { name: 'Skip Vacuum' }).click();
  await expect(today(page).getByText('Skipped by Pat')).toBeVisible();
  await today(page).getByRole('button', { name: 'Undo Vacuum' }).click();
  await expect(today(page).getByRole('button', { name: 'Mark Vacuum done' })).toBeVisible();

  // It asks first, in place of the menu; cancelling keeps the day
  await openMenu(today(page), 'Vacuum');
  await today(page).getByRole('button', { name: /^Delete: Vacuum/ }).click();
  await expect(confirmSheet(page)).toContainText('Its other days stay.');
  await confirmSheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmSheet(page)).toBeHidden();
  await expect(today(page).getByRole('button', { name: 'Mark Vacuum done' })).toBeVisible();

  await openMenu(today(page), 'Vacuum');
  await today(page).getByRole('button', { name: /^Delete: Vacuum/ }).click();
  await confirmSheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(today(page).getByText('Nothing scheduled')).toBeVisible();

  // Only that day: the task still comes up next week
  await page.getByRole('button', { name: /^Next/ }).click();
  await weekLoaded(page);
  await expect(day(page, 'Monday').getByText('Vacuum')).toBeVisible();
});

test('a backlog item done on an earlier day shows on that day as done', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addBacklogItem(page, 'Clean gutters');

  // Yesterday, in the browser's time zone (the household was created with it)
  const { iso, name, lastWeek } = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      name: d.toLocaleDateString('en-US', { weekday: 'long' }),
      lastWeek: d.getDay() === 6,
    };
  });

  await openMenu(backlog(page), 'Clean gutters');
  await backlog(page).getByRole('button', { name: 'Mark done: Clean gutters' }).click();
  await backlog(page).getByLabel('Done on').fill(iso);
  await backlog(page).getByRole('button', { name: 'Mark done' }).click();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();

  if (lastWeek) {
    await page.getByRole('button', { name: /^‹ Previous/ }).click();
    await weekLoaded(page);
  }
  await expect(day(page, name).getByText('Clean gutters')).toBeVisible();
  await expect(day(page, name).getByText('Done by Pat')).toBeVisible();
});

test('a backlog item can be deleted from the backlog, or for good from the week', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addBacklogItem(page, 'Fix gate');
  await addBacklogItem(page, 'Paint fence');

  await openMenu(backlog(page), 'Fix gate');
  await backlog(page).getByRole('button', { name: 'Delete: Fix gate' }).click();
  await confirmSheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(backlogItem(page, 'Fix gate')).toHaveCount(0);

  await backlog(page).getByRole('button', { name: 'Schedule Paint fence' }).click();
  await backlog(page).getByRole('button', { name: 'Add to day' }).click();
  await openMenu(today(page), 'Paint fence');
  await today(page).getByRole('button', { name: 'Delete: Paint fence' }).click();
  await confirmSheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(today(page).getByText('Paint fence', { exact: true })).toBeHidden();

  // Gone everywhere, even after a reload
  await page.reload();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();
  await expect(today(page).getByText('Paint fence')).toHaveCount(0);
});
