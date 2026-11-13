import { expect, test } from '@playwright/test';

import { PASSWORD, createHousehold, formReady, inviteCode, joinHousehold, logIn, register, uniqueEmail } from './helpers';

test('register, set up a household, log out and log back in', async ({ page }) => {
  const email = await register(page, 'Pat');

  // A new account chooses to create or join a household
  await expect(page.getByRole('heading', { name: 'Set up your household' })).toBeVisible();
  await createHousehold(page, 'Maple Street');
  await expect(page.getByText('Maple Street')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  // Signed-out users are sent to the login page
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await logIn(page, email);
  await expect(page.getByText('Welcome, Pat.')).toBeVisible();
  await expect(page.getByText('Maple Street')).toBeVisible();
});

test('a second user joins with the invite code and both see the same members', async ({ page, browser }) => {
  await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');
  const code = await inviteCode(page);

  // Sam signs up in a separate browser session, as on another phone
  const samContext = await browser.newContext();
  const sam = await samContext.newPage();
  await register(sam, 'Sam');
  await joinHousehold(sam, code);

  const members = (p: typeof page) => p.getByRole('heading', { name: 'Members' }).locator('xpath=following-sibling::ul[1]/li');
  await expect(sam.getByText('Maple Street')).toBeVisible();
  await expect(members(sam)).toHaveText(['Pat', 'Sam']);

  await page.reload();
  await expect(members(page)).toHaveText(['Pat', 'Sam']);
  await samContext.close();
});

test('deleting the account signs out, and the login stops working', async ({ page }) => {
  const email = await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete my account…' }).click();
  await formReady(page.getByLabel('Enter your password to confirm'));
  await page.getByLabel('Enter your password to confirm').fill(PASSWORD);
  await page.getByRole('button', { name: 'Permanently delete my account' }).click();

  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByRole('status')).toHaveText('Your account has been deleted.');

  await logIn(page, email);
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
});

test('a session survives a page reload, and each page knows whether you are logged in', async ({ page }) => {
  await register(page, 'Pat');
  await createHousehold(page, 'Maple Street');

  // The session is kept in the browser, so a reload or a typed address keeps you in
  await page.reload();
  await expect(page.getByText('Welcome, Pat.')).toBeVisible();
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/tasks$/);

  // Logged-in users don't see the login and register pages, and unknown addresses go home
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/register');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/no-such-page');
  await expect(page).toHaveURL(/\/$/);

  // Once logged out, every page of the app goes to the login page
  await page.getByRole('button', { name: 'Log out' }).click();
  for (const path of ['/tasks', '/tasks/new', '/settings']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('login and registration say what went wrong', async ({ page }) => {
  const email = await register(page, 'Pat');
  await page.getByRole('button', { name: 'Log out' }).click();

  await formReady(page.getByLabel('Email'));
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
  // An unknown email gets the same message, so it doesn't reveal who has an account
  await page.getByLabel('Email').fill(uniqueEmail('nobody'));
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password');

  // Emails are matched in any case
  await page.goto('/register');
  await formReady(page.getByLabel('Your name'));
  await page.getByLabel('Your name').fill('Pat again');
  await page.getByLabel('Email').fill(email.toUpperCase());
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('already');
  await expect(page).toHaveURL(/\/register$/);
});
