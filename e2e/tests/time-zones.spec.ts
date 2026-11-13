import { type Browser, expect, test } from '@playwright/test';

import { addBacklogItem, backlog, createHousehold, formReady, inviteCode, joinHousehold, register, today } from './helpers';

/*
 * The household's "today" comes from the time zone of the browser that created it; members can
 * live, or travel, somewhere else. Pago Pago (UTC-11) and Kiritimati (UTC+14) are 25 hours apart,
 * so their dates always differ, whatever time the tests run.
 *
 * Known defect (BILLIAMVT-51): the front end uses the viewer's own clock for "today" (backlog Done default,
 * the start date on the task form) while the server uses the household's time zone. These tests
 * describe the correct behaviour and are marked test.fail() until it's fixed; Playwright then
 * reports them as "passed unexpectedly", the cue to remove the mark.
 */
const BEHIND = 'Pacific/Pago_Pago';
const AHEAD = 'Pacific/Kiritimati';

/** Pat creates the household in one time zone; Sam joins from another. Returns Sam's page. */
async function householdAcrossZones(browser: Browser, householdZone: string, samZone: string) {
  const pat = await (await browser.newContext({ timezoneId: householdZone })).newPage();
  await register(pat, 'Pat');
  await createHousehold(pat, 'Maple Street');
  const code = await inviteCode(pat);
  await pat.context().close();

  const sam = await (await browser.newContext({ timezoneId: samZone })).newPage();
  await register(sam, 'Sam');
  await joinHousehold(sam, code);
  await expect(sam.getByRole('button', { name: 'This week' })).toBeAttached();
  return sam;
}

test.fail('a member ahead of the household marks a backlog item done with the default day', async ({ browser }) => {
  const sam = await householdAcrossZones(browser, BEHIND, AHEAD);
  await addBacklogItem(sam, 'Hang shelves');

  await backlog(sam).getByRole('button', { name: 'Mark Hang shelves done' }).click();
  await backlog(sam).getByRole('button', { name: 'Mark done' }).click();

  await expect(backlog(sam).getByText('Nothing in the backlog.')).toBeVisible();
  await expect(backlog(sam).getByRole('alert')).toHaveCount(0);
  await expect(today(sam).getByText('Hang shelves')).toBeVisible();
  await sam.context().close();
});

test.fail('a member behind the household adds a task starting on the default day', async ({ browser }) => {
  const sam = await householdAcrossZones(browser, AHEAD, BEHIND);

  await sam.getByRole('link', { name: 'Add a task' }).click();
  const name = sam.getByLabel('Task', { exact: true });
  await formReady(name);
  await name.fill('Water plants');
  await sam.getByLabel('Repeats').selectOption({ label: 'Every few days' });
  await sam.getByLabel('Every how many days?').fill('3');
  await sam.getByRole('button', { name: 'Save task' }).click();

  await expect(sam.getByRole('status')).toContainText('Saved: Water plants,');
  await sam.context().close();
});
