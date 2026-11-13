import { expect, test } from '@playwright/test';

import { addBacklogItem, addTask, backlog, backlogItem, day, signUpWithHousehold, today, weekLoaded } from './helpers';

test('a new daily task shows today, and can be marked done and undone', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  await addTask(page, 'Vacuum', 'Every day');

  await expect(page.getByRole('status')).toContainText('Saved: Vacuum, every day.');
  await expect(today(page).getByText('Vacuum')).toBeVisible();

  await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(page).getByText('✓ Done by Pat')).toBeVisible();

  await today(page).getByRole('button', { name: 'Undo Vacuum' }).click();
  await expect(today(page).getByText('✓ Done by Pat')).toBeHidden();
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

  // On the schedule, a one-off item has Done and Remove, but no Skip
  await expect(today(page).getByText('Hang shelves')).toBeVisible();
  await expect(today(page).getByRole('button', { name: 'Skip Hang shelves' })).toHaveCount(0);

  await today(page).getByRole('button', { name: /^Remove Hang shelves/ }).click();
  await today(page).getByRole('button', { name: 'Back to backlog' }).click();
  await expect(today(page).getByText('Hang shelves')).toBeHidden();
  await expect(backlogItem(page, 'Hang shelves')).toBeVisible();
});

test('a day of a recurring task can be skipped and undone, or deleted after confirming', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  await today(page).getByRole('button', { name: 'Skip Vacuum' }).click();
  await expect(today(page).getByText('Skipped by Pat')).toBeVisible();
  await today(page).getByRole('button', { name: 'Undo Vacuum' }).click();
  await expect(today(page).getByRole('button', { name: 'Skip Vacuum' })).toBeVisible();

  // The browser asks first; dismissing keeps the day
  const remove = today(page).getByRole('button', { name: /^Delete Vacuum on / });
  page.once('dialog', (dialog) => dialog.dismiss());
  await remove.click();
  await expect(today(page).getByText('Vacuum')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('This only removes this day');
    await dialog.accept();
  });
  await remove.click();
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

  await backlog(page).getByRole('button', { name: 'Mark Clean gutters done' }).click();
  await backlog(page).getByLabel('Done on').fill(iso);
  await backlog(page).getByRole('button', { name: 'Mark done' }).click();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();

  if (lastWeek) {
    await page.getByRole('button', { name: /^‹ Previous/ }).click();
    await weekLoaded(page);
  }
  await expect(day(page, name).getByText('Clean gutters')).toBeVisible();
  await expect(day(page, name).getByText('✓ Done by Pat')).toBeVisible();
});

test('a backlog item can be deleted from the backlog, or for good from the week', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addBacklogItem(page, 'Fix gate');
  await addBacklogItem(page, 'Paint fence');

  page.once('dialog', (dialog) => dialog.accept());
  await backlog(page).getByRole('button', { name: 'Delete Fix gate' }).click();
  await expect(backlogItem(page, 'Fix gate')).toHaveCount(0);

  await backlog(page).getByRole('button', { name: 'Schedule Paint fence' }).click();
  await backlog(page).getByRole('button', { name: 'Add to day' }).click();
  await today(page).getByRole('button', { name: /^Remove Paint fence/ }).click();
  await today(page).getByRole('button', { name: 'Delete for good' }).click();
  await expect(today(page).getByText('Paint fence')).toBeHidden();

  // Gone everywhere, even after a reload
  await page.reload();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();
  await expect(today(page).getByText('Paint fence')).toHaveCount(0);
});
