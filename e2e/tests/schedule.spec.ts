import { expect, test } from '@playwright/test';

import { addBacklogItem, addTask, backlog, backlogItem, confirmSheet, day, openMenu, signUpWithHousehold, today, weekLoaded } from './helpers';

test('the week moves with ‹ and ›, and Back to this week shows only on another week (BILLIAMVT-58)', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  const title = page.locator('#week-title');
  const thisWeek = await title.textContent();
  await expect(page.getByRole('button', { name: 'Back to this week' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Next week' }).click();
  await weekLoaded(page);
  await expect(title).not.toHaveText(thisWeek!);
  await page.getByRole('button', { name: 'Back to this week' }).click();
  await expect(title).toHaveText(thisWeek!);
  await expect(title).toBeFocused();
  await expect(page.getByRole('button', { name: 'Back to this week' })).toHaveCount(0);
});

test('a new daily task shows today, and can be marked done and undone', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  await addTask(page, 'Vacuum', 'Every day');

  await expect(page.locator('.toast')).toContainText('Saved: Vacuum, every day.');
  await expect(today(page).getByText('Vacuum')).toBeVisible();

  await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeVisible();

  await today(page).getByRole('button', { name: 'Undo Vacuum' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeHidden();
  await expect(today(page).getByRole('button', { name: 'Mark Vacuum done' })).toBeVisible();
});

test('a day can be moved to another day from its menu, without dragging (BILLIAMVT-56)', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  await openMenu(today(page), 'Vacuum');
  await today(page).getByRole('button', { name: 'Move: Vacuum' }).click();
  const sheet = confirmSheet(page);
  await expect(sheet).toContainText('Move Vacuum from');
  // The picker starts on the day it's on now (the household's today); move it to the next day
  const field = sheet.getByLabel('New day');
  const tomorrow = await field.evaluate((input: HTMLInputElement) => {
    const date = new Date(`${input.value}T12:00:00`);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString('en-CA');
  });
  await field.fill(tomorrow);
  await sheet.getByRole('button', { name: 'Move' }).click();

  // The confirmation is a toast at the bottom (BILLIAMVT-28)
  await expect(page.locator('.toast').getByText(/^Vacuum moved to \w+, \w{3} \d{1,2}\.$/)).toBeVisible();
  await expect(sheet).toBeHidden();
  // Only today's day moved; tomorrow may be in next week, so check today
  await expect(today(page).getByText('Vacuum')).toBeHidden();
});

test('a day can be dragged to another day (BILLIAMVT-28, drag-drop flag on locally)', async ({ page, browserName }) => {
  // A mouse drag; touch (press and hold) is checked on a real iPhone
  test.skip(browserName !== 'chromium', 'Mouse drag in Chromium only');
  // Tall enough that today and Saturday are both on screen: the mouse can't drag past the window
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  // Drag today's Vacuum onto the last day of the week (Saturday), unless today is Saturday
  const days = page.locator('.day');
  const last = days.last();
  test.skip(await last.evaluate((d) => d.classList.contains('today')), 'Today is the last day of the week');
  const row = today(page).locator('.occurrence').filter({ hasText: 'Vacuum' });
  const from = (await row.boundingBox())!;
  const to = (await last.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  // Only the day under the cursor is outlined: that's where it will land
  await expect(page.locator('.day.drop-over')).toHaveCount(1);
  await expect(last).toHaveClass(/drop-over/);
  await page.mouse.up();

  await expect(page.locator('.toast').getByText(/^Vacuum moved to Saturday, \w{3} \d{1,2}\.$/)).toBeVisible();
  await expect(today(page).getByText('Vacuum')).toBeHidden();
  // The daily task is on Saturday anyway, so Saturday now has two
  await expect(last.locator('.occurrence').filter({ hasText: 'Vacuum' })).toHaveCount(2);

  // Undo on the toast puts it back
  await page.locator('.toast').getByRole('button', { name: /^Undo: Vacuum moved to Saturday/ }).click();
  await expect(page.locator('.toast').getByText(/^Vacuum moved back to /)).toBeVisible();
  await expect(today(page).getByText('Vacuum')).toBeVisible();
  await expect(last.locator('.occurrence').filter({ hasText: 'Vacuum' })).toHaveCount(1);
});

test('letting go of a dragged day outside any day cancels the move (BILLIAMVT-28)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Mouse drag in Chromium only');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  // Over Saturday first, then below the week, onto the backlog, and let go there
  const row = today(page).locator('.occurrence').filter({ hasText: 'Vacuum' });
  const from = (await row.boundingBox())!;
  const saturday = (await page.locator('.day').last().boundingBox())!;
  const below = (await backlog(page).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(saturday.x + saturday.width / 2, saturday.y + saturday.height / 2, { steps: 10 });
  await page.mouse.move(below.x + below.width / 2, below.y + 40, { steps: 10 });
  // No day is outlined: letting go here cancels
  await expect(page.locator('.day.drop-over')).toHaveCount(0);
  await page.mouse.up();

  await expect(today(page).getByText('Vacuum')).toBeVisible();
  await expect(page.locator('.toast').getByText(/moved to/)).toHaveCount(0);
});

test('a weekly task on several days shows on exactly those days', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  // Chosen out of order: the app sorts them
  await addTask(page, 'Laundry', 'Every week', ['Thursday', 'Monday']);
  await expect(page.locator('.toast')).toContainText('Saved: Laundry, every week on Monday and Thursday.');

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
    await page.getByRole('button', { name: 'Previous week' }).click();
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

test('a one-time task can be added straight to a day, without the backlog (BILLIAMVT-59)', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');

  // The day defaults to today, which is always in the shown week
  await addTask(page, 'Vacuum', 'Never (one time)');

  await expect(page.locator('.toast')).toContainText(/Saved: Vacuum, \w+, \w{3} \d{1,2}\./);
  await expect(today(page).getByText('Vacuum')).toBeVisible();
  await expect(backlog(page).getByText('Nothing in the backlog.')).toBeVisible();

  // It behaves like any day: it can be marked done
  await today(page).getByRole('button', { name: 'Mark Vacuum done' }).click();
  await expect(today(page).getByText('Done by Pat')).toBeVisible();
});
