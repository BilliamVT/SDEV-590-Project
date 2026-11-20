import { type Page, expect, test } from '@playwright/test';

import { addTask, signUpWithHousehold, today, confirmSheet } from './helpers';

/** Changes made on the Tasks page show in the week on the home page. */
test('editing, pausing, resuming and deleting a task changes the week', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Dishes', 'Every day');
  await expect(today(page).getByText('Dishes')).toBeVisible();

  const tasksPage = async () => {
    await page.getByRole('link', { name: 'Your tasks' }).click();
    await expect(page.getByRole('heading', { name: 'Your tasks' })).toBeVisible();
  };
  const week = async () => page.getByRole('link', { name: 'Back to the week' }).click();
  const row = (p: Page, name: string) => p.getByRole('listitem').filter({ hasText: name });

  // Your tasks says when each task was last done, and by whom (BILLIAMVT-26)
  await tasksPage();
  await expect(row(page, 'Dishes')).toContainText('Not done yet');
  await week();
  await today(page).getByRole('button', { name: /^Mark Dishes done/ }).click();
  await expect(today(page).getByText('Done by Pat')).toBeVisible();
  await tasksPage();
  await expect(row(page, 'Dishes')).toContainText(/Last done \w{3}, \w{3} \d{1,2} by Pat/);
  // Undone again, so pausing below clears today (a done day stays as history)
  await week();
  await today(page).getByRole('button', { name: /^Undo Dishes/ }).click();
  await expect(today(page).getByRole('button', { name: /^Mark Dishes done/ })).toBeVisible();

  // Editing the name renames today's occurrence too
  await tasksPage();
  await row(page, 'Dishes').getByRole('link', { name: 'Edit' }).click();
  // The form is filled in from the server first
  const taskName = page.getByLabel('Task', { exact: true });
  await expect(taskName).toHaveValue('Dishes');
  await taskName.fill('Wash dishes');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.locator('.toast')).toContainText('Saved: Wash dishes, every day.');
  await week();
  await expect(today(page).getByText('Wash dishes')).toBeVisible();

  // Paused: off the schedule from today
  await tasksPage();
  await row(page, 'Wash dishes').getByRole('button', { name: 'Pause' }).click();
  await expect(row(page, 'Wash dishes').getByText('Paused')).toBeVisible();
  await week();
  await expect(today(page).getByText('Nothing scheduled')).toBeVisible();

  // Resumed: back from today
  await tasksPage();
  await row(page, 'Wash dishes').getByRole('button', { name: 'Resume' }).click();
  await expect(row(page, 'Wash dishes').getByText('Paused')).toBeHidden();
  await week();
  await expect(today(page).getByText('Wash dishes')).toBeVisible();

  // Deleted, after confirming: gone from the list and from today
  await tasksPage();
  await row(page, 'Wash dishes').getByRole('button', { name: 'Delete' }).click();
  await confirmSheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No tasks yet. Add your first one.')).toBeVisible();
  await week();
  await expect(today(page).getByText('Nothing scheduled')).toBeVisible();
});

test('saving a new task confirms it in a toast that offers to add another (BILLIAMVT-57)', async ({ page }) => {
  await signUpWithHousehold(page, 'Pat');
  await addTask(page, 'Vacuum', 'Every day');

  const toast = page.locator('.toast');
  await expect(toast).toContainText('Saved: Vacuum, every day.');
  // Nothing stays at the top of the week
  await expect(page.locator('.notice').filter({ hasText: 'Saved' })).toHaveCount(0);

  await toast.getByRole('button', { name: /^Add another/ }).click();
  await expect(page).toHaveURL(/\/tasks\/new$/);
  await expect(toast).toBeHidden();
});
