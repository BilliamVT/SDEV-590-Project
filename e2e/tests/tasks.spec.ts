import { type Page, expect, test } from '@playwright/test';

import { addTask, signUpWithHousehold, today } from './helpers';

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

  // Editing the name renames today's occurrence too
  await tasksPage();
  await row(page, 'Dishes').getByRole('link', { name: 'Edit' }).click();
  // The form is filled in from the server first
  const taskName = page.getByLabel('Task', { exact: true });
  await expect(taskName).toHaveValue('Dishes');
  await taskName.fill('Wash dishes');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('status')).toContainText('Saved: Wash dishes, every day.');
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
  await row(page, 'Wash dishes').getByRole('button', { name: 'Delete…' }).click();
  await row(page, 'Wash dishes').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No tasks yet. Add your first one.')).toBeVisible();
  await week();
  await expect(today(page).getByText('Nothing scheduled')).toBeVisible();
});
