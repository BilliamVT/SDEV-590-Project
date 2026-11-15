import { randomUUID } from 'node:crypto';

import { type Locator, type Page, expect } from '@playwright/test';

export const PASSWORD = 'correct-horse-battery';

/** A new email every time, so tests never share accounts and can run in parallel or again. */
export function uniqueEmail(name: string): string {
  return `e2e-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Registers a new account; the app then asks to create or join a household. */
export async function register(page: Page, name: string, email = uniqueEmail(name)): Promise<string> {
  await page.goto('/register');
  await formReady(page.getByLabel('Your name'));
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Welcome, ${name}.`)).toBeVisible();
  return email;
}

export async function createHousehold(page: Page, name: string): Promise<void> {
  await formReady(page.getByLabel('Name', { exact: true }));
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create household' }).click();
  // The household's details are in Settings; home confirms it and shows the week (BILLIAMVT-49)
  await expect(page.getByRole('status').filter({ hasText: `${name} is ready.` })).toBeVisible();
}

/** Logs in from the login page. */
export async function logIn(page: Page, email: string): Promise<void> {
  await formReady(page.getByLabel('Email'));
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** A new user in a new household, on the home page with the week showing. */
export async function signUpWithHousehold(page: Page, name: string): Promise<void> {
  await register(page, name);
  await createHousehold(page, `${name}'s home`);
  await expect(page.getByRole('button', { name: 'This week' })).toBeVisible();
}

/**
 * Waits until Angular has connected a form field. A page reached by a link inside the app
 * appears almost at once; typing in the few milliseconds before Angular sets up the form
 * would be overwritten by the field's starting value. People can't type that fast; tests can.
 */
export async function formReady(field: Locator): Promise<void> {
  await expect(field).toHaveClass(/ng-pristine|ng-dirty/);
}

/**
 * Adds a task from the home page and comes back to the week. {@code days} are full names
 * ('Monday'), for weekly schedules.
 */
export async function addTask(page: Page, name: string, repeats: string, days: string[] = []): Promise<void> {
  await page.getByRole('link', { name: 'Add a task' }).click();
  const taskName = page.getByLabel('Task', { exact: true });
  await formReady(taskName);
  await taskName.fill(name);
  await page.getByLabel('Repeats').selectOption({ label: repeats });
  for (const day of days) {
    await page.getByRole('button', { name: day, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByRole('status')).toContainText(`Saved: ${name},`);
}

/** Today in the week view. */
export function today(page: Page) {
  return page.locator('.day.today');
}

/** A day of the shown week, by its full name ('Monday'). */
export function day(page: Page, name: string) {
  return page.locator('.day').filter({ has: page.getByRole('heading', { name: new RegExp(`^${name},`) }) });
}

/** Waits until the week view has finished loading the week it shows. */
export async function weekLoaded(page: Page): Promise<void> {
  await expect(page.locator('.days')).not.toHaveClass(/refreshing/);
}

/** The household's invite code, from Settings (BILLIAMVT-49). Leaves the page on Settings. */
export async function inviteCode(page: Page): Promise<string> {
  await openSettings(page);
  return page.locator('.invite code').innerText();
}

/** Opens Settings from the header, as a user would. */
export async function openSettings(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: 'Account' }).getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
}

/** Checks the household's name and members in Settings. Leaves the page on Settings. */
export async function expectHousehold(page: Page, name: string, members?: string[]): Promise<void> {
  await openSettings(page);
  await expect(page.locator('.setting .name')).toHaveText(name);
  if (members) {
    await expect(page.locator('.members li')).toHaveText(members);
  }
}

/** Joins a household from the setup form a new account sees. */
export async function joinHousehold(page: Page, code: string): Promise<void> {
  const field = page.getByLabel('Invite code');
  await formReady(field);
  await field.fill(code);
  await page.getByRole('button', { name: 'Join household' }).click();
}

/** Joins with a code that should work, and waits until the household is set up. */
export async function joinHouseholdNamed(page: Page, code: string, name: string): Promise<void> {
  await joinHousehold(page, code);
  await expect(page.getByRole('status').filter({ hasText: `${name} is ready.` })).toBeVisible();
}

/** The backlog section under the week. */
export function backlog(page: Page): Locator {
  return page.getByRole('region', { name: 'Backlog' });
}

/** Adds a one-off item to the backlog and waits for it to show. */
export async function addBacklogItem(page: Page, name: string): Promise<void> {
  const field = backlog(page).getByLabel('One-off item');
  await formReady(field);
  await field.fill(name);
  await backlog(page).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(backlogItem(page, name)).toBeVisible();
}

/** One item in the backlog list. */
export function backlogItem(page: Page, name: string): Locator {
  return backlog(page).getByRole('listitem').filter({ hasText: name });
}

/** Opens a row's ⋯ menu (Skip, Delete, Remove; Mark done in the backlog), in the week view or the backlog. */
export async function openMenu(scope: Locator, name: string): Promise<void> {
  await scope.getByRole('button', { name: new RegExp(`^More for ${name}`) }).click();
}

/** The action sheet that asks before deleting (BILLIAMVT-49). */
export function confirmSheet(page: Page): Locator {
  return page.getByRole('dialog');
}
