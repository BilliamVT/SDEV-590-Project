import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { BacklogService } from '../backlog/backlog.service';
import { FeatureFlagsService } from '../feature/feature-flags.service';
import { HouseholdService } from '../household/household.service';
import { Announcer } from '../shared/announcer';
import { Toast } from '../shared/toast';
import { OccurrenceStatus, Schedule, ScheduledOccurrence } from './schedule.models';
import { ScheduleService } from './schedule.service';
import { WeekView } from './week-view';

/** The household's members, to assign days to (BILLIAMVT-64) */
const MEMBERS = [
  { id: 1, displayName: 'Pat Lee' },
  { id: 2, displayName: 'Sam Ray' },
];

const occurrence = (id: number, taskName: string, date: string, extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
  id,
  taskId: id,
  taskName,
  date,
  originalDate: date,
  status: 'PENDING',
  estimatedMinutes: null,
  overdue: false,
  taskDeleted: false,
  completedByName: null,
  completedById: null,
  completedAt: null,
  oneOff: false,
  assigneeId: null,
  assigneeName: null,
  assignmentSet: false,
  ...extra,
});

const schedule = (from: string, to: string, occurrences: ScheduledOccurrence[] = [], lastViewableDate = '2028-11-11'): Schedule => ({
  from,
  to,
  today: '2026-11-11',
  lastViewableDate,
  occurrences,
});

/** The logged-in user: Pat, id 1. A day this account marks done comes back with completedById ME. */
const ME = 1;

/** The delete action sheet (BILLIAMVT-49): whether it's open, and what it asks. */
const sheetOpen = (element: HTMLElement) => element.querySelector('dialog.sheet[open]') !== null;
const sheetMessage = (element: HTMLElement) => element.querySelector('dialog.sheet[open] .message')?.textContent?.trim();

describe('WeekView', () => {
  // Wednesday Nov 11, 2026: this week runs Sunday Nov 8 to Saturday Nov 14
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 12));
  });
  afterEach(() => vi.useRealTimers());

  /** The drag-drop flag (BILLIAMVT-28); off unless a test turns it on */
  const dragDrop = signal(false);
  beforeEach(() => dragDrop.set(false));

  async function render(
    between: (from: string, to: string) => Observable<Schedule> = (from, to) => of(schedule(from, to)),
    changeStatus: (id: number, status: OccurrenceStatus) => Observable<ScheduledOccurrence> = () => NEVER,
    remove: (id: number) => Observable<void> = () => of(undefined),
    deleteItem: (id: number) => Observable<void> = () => of(undefined),
    move: (id: number, date: string) => Observable<ScheduledOccurrence> = () => NEVER,
    assign: (id: number, assigneeId: number | null) => Observable<ScheduledOccurrence> = () => NEVER,
    followTask: (id: number) => Observable<ScheduledOccurrence> = () => NEVER,
  ) {
    const schedules = {
      between: vi.fn(between),
      changeStatus: vi.fn(changeStatus),
      delete: vi.fn(remove),
      move: vi.fn(move),
      assign: vi.fn(assign),
      followTask: vi.fn(followTask),
    };
    const backlog = { delete: vi.fn(deleteItem) };
    await TestBed.configureTestingModule({
      imports: [WeekView],
      providers: [
        { provide: ScheduleService, useValue: schedules },
        { provide: BacklogService, useValue: backlog },
        { provide: AuthService, useValue: { user: signal({ id: ME, email: 'pat@example.com', displayName: 'Pat' }) } },
        { provide: FeatureFlagsService, useValue: { dragDrop } },
        { provide: HouseholdService, useValue: { members: signal(MEMBERS), load: () => NEVER } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(WeekView);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    // A button by its accessible name: its aria-label, or else its text
    const button = (name: string) =>
      [...element.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name)!;
    const click = async (name: string) => {
      button(name).click();
      await fixture.whenStable();
    };
    return { schedules, backlog, element, click, button, fixture };
  }

  it('shows this week, Sunday to Saturday, with today marked', async () => {
    const { schedules, element } = await render();

    expect(schedules.between).toHaveBeenCalledWith('2026-11-08', '2026-11-14');
    expect(element.querySelector('h2')?.textContent).toBe('Nov 8 – 14, 2026');
    const days = [...element.querySelectorAll('.day h3')].map((h) => h.textContent?.trim());
    expect(days[0]).toBe('Sunday, Nov 8');
    expect(days[6]).toBe('Saturday, Nov 14');
    expect(element.querySelector('.day.today h3')?.textContent).toContain('Wednesday, Nov 11');
    expect(element.querySelector('.day.today .today-label')?.textContent).toBe('Today');
  });

  it("lists each day's tasks, with minutes and overdue highlighted", async () => {
    const { element } = await render((from, to) =>
      of(
        schedule(from, to, [
          occurrence(1, 'Vacuum', '2026-11-09', { overdue: true, estimatedMinutes: 30 }),
          occurrence(2, 'Dishes', '2026-11-11'),
          occurrence(3, 'Laundry', '2026-11-11'),
        ]),
      ),
    );
    const day = (n: number) => element.querySelectorAll('.day')[n];

    expect(day(1).querySelector('.occurrence.overdue .name')?.textContent).toBe('Vacuum');
    expect(day(1).querySelector('.minutes')?.textContent).toBe('30 min');
    expect(day(1).querySelector('.overdue-label')?.textContent).toBe('Overdue');
    expect([...day(3).querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['Dishes', 'Laundry']);
    expect(day(0).querySelector('.empty')?.textContent).toBe('Nothing scheduled');
  });

  it("shows a deleted task's past occurrences muted, as history", async () => {
    const { element } = await render((from, to) =>
      of(schedule(from, to, [occurrence(1, 'Old chore', '2026-11-09', { taskDeleted: true })])),
    );

    const item = element.querySelector('.occurrence');
    expect(item?.classList).toContain('deleted');
    expect(item?.querySelector('.overdue-label')).toBeNull();
  });

  it("shows the household's week when its today is in another week than the device's (BILLIAMVT-51)", async () => {
    // The device says Wednesday Nov 11; the household, far ahead, is already on Sunday Nov 15
    const { schedules, element, button } = await render((from, to) => of({ ...schedule(from, to), today: '2026-11-15' }));

    expect(schedules.between).toHaveBeenLastCalledWith('2026-11-15', '2026-11-21');
    expect(element.querySelector('h2')?.textContent).toBe('Nov 15 – 21, 2026');
    expect(element.querySelector('.day.today h3')?.textContent).toContain('Sunday, Nov 15');
    expect(button('This week').disabled).toBe(true);
  });

  it('moves between weeks', async () => {
    const { schedules, element, click, button } = await render();
    expect(button('This week').disabled).toBe(true);

    await click('Next ›');
    expect(schedules.between).toHaveBeenLastCalledWith('2026-11-15', '2026-11-21');
    expect(element.querySelector('h2')?.textContent).toBe('Nov 15 – 21, 2026');
    expect(button('This week').disabled).toBe(false);

    await click('‹ Previous');
    await click('‹ Previous');
    expect(schedules.between).toHaveBeenLastCalledWith('2026-11-01', '2026-11-07');

    await click('This week');
    expect(schedules.between).toHaveBeenLastCalledWith('2026-11-08', '2026-11-14');
  });

  it('stops at the 2-year limit and says why', async () => {
    // The last week whose end is still on or before the limit
    const { element, button } = await render((from, to) => of(schedule(from, to, [], '2026-11-20')));

    expect(button('Next ›').disabled).toBe(true);
    expect(element.textContent).toContain('You can plan up to 2 years ahead.');
  });

  it('allows the next week while it ends on or before the limit', async () => {
    const { element, button } = await render((from, to) => of(schedule(from, to, [], '2026-11-21')));

    expect(button('Next ›').disabled).toBe(false);
    expect(element.textContent).not.toContain('2 years ahead');
  });

  it('explains the wait while the server wakes up', async () => {
    const { element } = await render(() => NEVER);
    expect(element.textContent).toContain('Loading your week');
  });

  it('stays hidden when the user has no household yet', async () => {
    const { element } = await render(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    expect(element.querySelector('.week')).toBeNull();
  });

  it('shows other errors', async () => {
    const { element } = await render(() => throwError(() => new HttpErrorResponse({ status: 0 })));
    expect(element.textContent).toContain("couldn't be reached");
  });

  it('offers Try again when the week failed to load, and only then (BILLIAMVT-53)', async () => {
    let calls = 0;
    const { element, fixture } = await render((from, to) =>
      ++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 0 })) : of(schedule(from, to, [])),
    );
    const retry = () => element.querySelector<HTMLButtonElement>('button.retry');

    retry()!.click();
    await fixture.whenStable();

    expect(calls).toBe(2);
    expect(element.textContent).not.toContain("couldn't be reached");
    expect(element.querySelectorAll('.day')).toHaveLength(7);
    expect(retry()).toBeNull();
  });

  describe('marking done or skipped', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
    const withVacuum = (from: string, to: string) => of(schedule(from, to, [vacuum]));
    const labelOf = (element: HTMLElement) => element.querySelector('.meta')?.textContent?.trim() || undefined;
    const more = 'More for Vacuum on Wednesday, Nov 11';

    it('marks a task done and shows who did it', async () => {
      const { schedules, element, click } = await render(withVacuum, (id, status) =>
        of({ ...vacuum, completedById: ME, status, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' }),
      );

      // The circle, as in a checklist (BILLIAMVT-49)
      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'DONE');
      expect(element.querySelector('.occurrence')?.getAttribute('data-status')).toBe('DONE');
      expect(labelOf(element)).toBe('Done by Pat');
      expect(element.querySelector('button[aria-label="Undo Vacuum, Wednesday, Nov 11"]')).not.toBeNull();
    });

    it('names each circle with its day, so the seven Vacuum circles in a week differ (BILLIAMVT-49)', async () => {
      const twoDays = [vacuum, occurrence(2, 'Vacuum', '2026-11-12')];
      const { element } = await render((from, to) => of(schedule(from, to, twoDays)));
      expect([...element.querySelectorAll('.check')].map((b) => b.getAttribute('aria-label'))).toEqual([
        'Mark Vacuum done, Wednesday, Nov 11',
        'Mark Vacuum done, Thursday, Nov 12',
      ]);
    });

    it('tells screen readers what changed, and keeps focus on the circle (BILLIAMVT-49)', async () => {
      const { element, click, button } = await render(withVacuum, (id, status) => of({ ...vacuum, completedById: ME, status }));
      const circle = button('Mark Vacuum done, Wednesday, Nov 11');
      circle.focus();

      await click('Mark Vacuum done, Wednesday, Nov 11');
      await new Promise((resolve) => setTimeout(resolve));

      expect(TestBed.inject(Announcer).message()).toBe('Vacuum marked done');
      // The same button, now labelled Undo, so focus isn't lost
      expect(button('Undo Vacuum, Wednesday, Nov 11')).toBe(circle);
      expect(document.activeElement).toBe(circle);
      expect(element.querySelector('.occurrence')?.getAttribute('data-status')).toBe('DONE');
    });

    it('skips a task', async () => {
      const { schedules, element, click, button } = await render(withVacuum, (id, status) =>
        of({ ...vacuum, completedById: ME, status, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' }),
      );

      // Skip is under ⋯, which closes again afterwards
      await click(more);
      expect(button(more).getAttribute('aria-expanded')).toBe('true');
      await click('Skip Vacuum');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'SKIPPED');
      expect(labelOf(element)).toBe('Skipped by Pat');
      expect(element.querySelector('.menu')).toBeNull();
    });

    it('tells the page when a status changes, so the backlog can reload (BILLIAMVT-23)', async () => {
      const { fixture, click } = await render(withVacuum, (id, status) => of({ ...vacuum, completedById: ME, status }));
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await click(more);
      await click('Skip Vacuum');

      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('undoes back to pending', async () => {
      const done = { ...vacuum, status: 'DONE' as const, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' };
      const { schedules, element, click } = await render(
        (from, to) => of(schedule(from, to, [done])),
        () => of(vacuum),
      );

      await click('Undo Vacuum, Wednesday, Nov 11');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'PENDING');
      expect(labelOf(element)).toBeUndefined();
      expect(element.querySelector('button[aria-label="Mark Vacuum done, Wednesday, Nov 11"]')).not.toBeNull();
    });

    it('disables the buttons while saving', async () => {
      const { element, click, button } = await render(withVacuum);

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(button('Mark Vacuum done, Wednesday, Nov 11').disabled).toBe(true);
      expect(button(more).disabled).toBe(true);
      expect(element.querySelector('.occurrence')?.getAttribute('data-status')).toBe('PENDING');
    });

    it('shows an error on the item when saving fails', async () => {
      const { element, click, button } = await render(withVacuum, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
      expect(button('Mark Vacuum done, Wednesday, Nov 11').disabled).toBe(false);
    });
  });

  describe('deleting one day', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { status: 'DONE', taskDeleted: true, completedByName: 'Pat' });
    const withVacuum = (from: string, to: string) => of(schedule(from, to, [vacuum]));
    afterEach(() => vi.restoreAllMocks());
    const openDelete = async (click: (name: string) => Promise<void>) => {
      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Delete: Vacuum, Wednesday, Nov 11');
    };

    it('asks first in an action sheet, then removes only that day (BILLIAMVT-49)', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const { schedules, element, click, button } = await render(withVacuum);

      await openDelete(click);

      expect(confirm).not.toHaveBeenCalled();
      expect(schedules.delete).not.toHaveBeenCalled();
      expect(sheetOpen(element)).toBe(true);
      expect(sheetMessage(element)).toBe('Delete Vacuum on Wednesday, Nov 11? Its other days stay.');
      expect(element.querySelector('.menu')).toBeNull();

      await click('Delete');

      expect(schedules.delete).toHaveBeenCalledWith(1);
      expect(element.querySelector('.occurrence')).toBeNull();
      expect(element.querySelectorAll('.day')[3].querySelector('.empty')?.textContent).toBe('Nothing scheduled');
    });

    it('tells the page after deleting, and reloads when asked (BILLIAMVT-23)', async () => {
      const { schedules, fixture, click } = await render(withVacuum);
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await openDelete(click);
      await click('Delete');
      expect(changed).toHaveBeenCalledTimes(1);

      fixture.componentInstance.reload();
      expect(schedules.between).toHaveBeenCalledTimes(2);
    });

    it('does nothing if the user cancels', async () => {
      const { schedules, element, click, button } = await render(withVacuum);

      await openDelete(click);
      await click('Cancel');

      expect(schedules.delete).not.toHaveBeenCalled();
      expect(sheetOpen(element)).toBe(false);
      expect(button('Undo Vacuum, Wednesday, Nov 11')).toBeDefined();
    });

    it('keeps it and shows an error when deleting fails', async () => {
      const { element, click } = await render(withVacuum, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await openDelete(click);
      await click('Delete');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
    });

    it('keeps Skip and Delete under ⋯: a done day only offers Delete (BILLIAMVT-49)', async () => {
      const pending = occurrence(2, 'Dishes', '2026-11-11');
      const { element, click } = await render((from, to) => of(schedule(from, to, [pending, vacuum])));
      const menu = () => [...element.querySelectorAll('.menu button')].map((b) => b.textContent?.trim());

      expect(element.querySelector('.menu')).toBeNull();
      await click('More for Dishes on Wednesday, Nov 11');
      // Move too, since BILLIAMVT-56
      expect(menu()).toEqual(['Move', 'Assign', 'Skip', 'Delete']);
      // Only one menu at a time
      await click('More for Vacuum on Wednesday, Nov 11');
      expect(menu()).toEqual(['Delete']);
      await click('More for Vacuum on Wednesday, Nov 11');
      expect(element.querySelector('.menu')).toBeNull();
    });

    it('puts focus back on ⋯ when Escape closes the menu or the action sheet is cancelled (BILLIAMVT-49)', async () => {
      const { click, button } = await render(withVacuum);
      const more = 'More for Vacuum on Wednesday, Nov 11';

      await click(more);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise((resolve) => setTimeout(resolve));
      expect(document.activeElement).toBe(button(more));

      await click(more);
      await click('Delete: Vacuum, Wednesday, Nov 11');
      await click('Cancel');
      await new Promise((resolve) => setTimeout(resolve));
      expect(document.activeElement).toBe(button(more));
    });

    it('after deleting, announces it and focuses the day, since the row is gone (BILLIAMVT-49)', async () => {
      const { element, click } = await render(withVacuum);

      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Delete: Vacuum, Wednesday, Nov 11');
      await click('Delete');
      await new Promise((resolve) => setTimeout(resolve));

      expect(TestBed.inject(Announcer).message()).toBe('Vacuum on Wednesday, Nov 11 deleted');
      expect(document.activeElement).toBe(element.querySelector('[data-date="2026-11-11"] h3'));
    });

    it('floats the menu over the list, and closes it on a tap elsewhere or Escape (BILLIAMVT-49)', async () => {
      const { element, fixture, click } = await render(withVacuum);
      const isOpen = () => element.querySelector('.menu.popover-menu') !== null;

      await click('More for Vacuum on Wednesday, Nov 11');
      expect(isOpen()).toBe(true);
      // A tap inside the menu doesn't close it
      element.querySelector<HTMLElement>('.menu')!.click();
      await fixture.whenStable();
      expect(isOpen()).toBe(true);

      element.querySelector<HTMLElement>('h2')!.click();
      await fixture.whenStable();
      expect(isOpen()).toBe(false);

      await click('More for Vacuum on Wednesday, Nov 11');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();
      expect(isOpen()).toBe(false);
    });
  });

  describe("removing a one-off item's day (BILLIAMVT-23)", () => {
    const shelves = occurrence(5, 'Hang shelves', '2026-11-11', { taskId: 9, oneOff: true });
    const withShelves = (from: string, to: string) => of(schedule(from, to, [shelves]));
    const openMenu = (click: (name: string) => Promise<void>) => click('More for Hang shelves on Wednesday, Nov 11');
    afterEach(() => vi.restoreAllMocks());

    it('offers back to the backlog or delete for good in its menu, but no Skip (BILLIAMVT-49)', async () => {
      const { element, click, button } = await render(withShelves);

      expect(button('Mark Hang shelves done, Wednesday, Nov 11')).toBeDefined();
      await openMenu(click);
      expect([...element.querySelectorAll('.menu button')].map((b) => b.textContent?.trim())).toEqual([
        'Move',
        'Assign',
        'Back to backlog',
        'Delete',
      ]);
    });

    it('puts it back in the backlog at once, without asking: it is easy to reverse', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const { schedules, backlog, element, fixture, click } = await render(withShelves);
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await openMenu(click);
      await click('Back to backlog: Hang shelves');

      expect(confirm).not.toHaveBeenCalled();
      expect(sheetOpen(element)).toBe(false);
      expect(schedules.delete).toHaveBeenCalledWith(5);
      expect(backlog.delete).not.toHaveBeenCalled();
      expect(element.querySelector('.occurrence')).toBeNull();
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('asks in an action sheet before deleting it for good, and can be cancelled', async () => {
      const { backlog, element, click, button } = await render(withShelves);

      await openMenu(click);
      await click('Delete: Hang shelves');

      expect(element.querySelector('.menu')).toBeNull();
      expect(sheetOpen(element)).toBe(true);
      expect(sheetMessage(element)).toBe("Delete Hang shelves for good? This can't be undone.");
      await click('Cancel');
      expect(sheetOpen(element)).toBe(false);
      expect(backlog.delete).not.toHaveBeenCalled();
      expect(button('Mark Hang shelves done, Wednesday, Nov 11')).toBeDefined();
    });

    it('deletes the item and its days for good', async () => {
      const { schedules, backlog, element, click } = await render(withShelves);

      await openMenu(click);
      await click('Delete: Hang shelves');
      await click('Delete');

      expect(backlog.delete).toHaveBeenCalledWith(9);
      expect(schedules.delete).not.toHaveBeenCalled();
      expect(element.querySelector('.occurrence')).toBeNull();
    });

    it('keeps the action sheet open and shows the error in it when it fails', async () => {
      const { element, click } = await render(withShelves, undefined, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await openMenu(click);
      await click('Delete: Hang shelves');
      await click('Delete');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
      expect(sheetOpen(element)).toBe(true);
      expect(element.querySelector('dialog.sheet [role="alert"]')?.textContent).toContain("couldn't be reached");
    });
  });

  describe('when the week changed elsewhere (BILLIAMVT-55)', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
    const notice = (element: HTMLElement) =>
      element.querySelector('.notice[role="status"]')?.textContent?.trim();
    const conflict = (status: number) => () => throwError(() => new HttpErrorResponse({ status }));

    it('reloads silently when the app comes back into view', async () => {
      const { schedules, element, fixture } = await render((from, to) =>
        of(schedule(from, to, [vacuum])),
      );
      expect(schedules.between).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event('visibilitychange'));
      await fixture.whenStable();

      expect(schedules.between).toHaveBeenCalledTimes(2);
      expect(notice(element)).toBeUndefined();
    });

    it('names who already marked it done, reloads, and tells the backlog', async () => {
      const { schedules, element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        (id, status) => of({ ...vacuum, status, completedById: 2, completedByName: 'Sam' }),
      );
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBe('Sam already marked Vacuum done. Your week is up to date.');
      expect(schedules.between).toHaveBeenCalledTimes(2);
      expect(changed).toHaveBeenCalled();
    });

    it('says "You" when this account already did it, e.g. on another device (409)', async () => {
      let calls = 0;
      const doneByMe = {
        ...vacuum,
        status: 'DONE' as const,
        completedById: ME,
        completedByName: 'Pat',
      };
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, [calls++ === 0 ? vacuum : doneByMe])),
        conflict(409),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBe('You already marked Vacuum done. Your week is up to date.');
    });

    it('stays neutral when the member who did it has deleted their account', async () => {
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        (id, status) => of({ ...vacuum, status, completedById: null, completedByName: null }),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBe('Vacuum was already marked done. Your week is up to date.');
    });

    it('says a day was already removed (404), and reloads', async () => {
      let calls = 0;
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, calls++ === 0 ? [vacuum] : [])),
        conflict(404),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBe('Vacuum was already removed. Your week is up to date.');
      expect(element.querySelector('.occurrence')).toBeNull();
      expect(element.querySelector('.item-error')).toBeNull();
    });

    it('describes the day as it is now after a conflict (409)', async () => {
      let calls = 0;
      const skippedBySam = {
        ...vacuum,
        status: 'SKIPPED' as const,
        completedById: 2,
        completedByName: 'Sam',
      };
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, [calls++ === 0 ? vacuum : skippedBySam])),
        conflict(409),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBe('Sam already skipped Vacuum. Your week is up to date.');
    });

    it('clears the notice on the next action', async () => {
      let calls = 0;
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, calls++ === 0 ? [vacuum] : [])),
        conflict(404),
      );
      await click('Mark Vacuum done, Wednesday, Nov 11');
      expect(notice(element)).toBeDefined();

      await click('‹ Previous');

      expect(notice(element)).toBeUndefined();
    });

    it('still shows other errors on the row', async () => {
      const { element, click } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        conflict(500),
      );

      await click('Mark Vacuum done, Wednesday, Nov 11');

      expect(notice(element)).toBeUndefined();
      expect(element.querySelector('.item-error')).not.toBeNull();
    });
  });

  describe('assigning (BILLIAMVT-64)', () => {
    const assignSheet = (element: HTMLElement) => element.querySelectorAll<HTMLDialogElement>('dialog.sheet')[2];
    const choices = (element: HTMLElement) =>
      [...assignSheet(element).querySelectorAll<HTMLLabelElement>('.choice')].map((label) => ({
        name: label.textContent?.trim(),
        checked: label.querySelector('input')!.checked,
      }));
    const choose = async (element: HTMLElement, fixture: { whenStable: () => Promise<unknown> }, name: string) => {
      const label = [...assignSheet(element).querySelectorAll('.choice')].find((l) => l.textContent?.trim() === name)!;
      label.querySelector('input')!.click();
      await fixture.whenStable();
    };
    const confirm = async (element: HTMLElement, fixture: { whenStable: () => Promise<unknown> }) => {
      [...assignSheet(element).querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Assign')!.click();
      await fixture.whenStable();
    };

    it("shows a pending day's assignee by first name, and who did it once it's done", async () => {
      const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { assigneeId: 2, assigneeName: 'Sam Ray' });
      const dishes = occurrence(2, 'Dishes', '2026-11-11', {
        assigneeId: 2,
        assigneeName: 'Sam Ray',
        status: 'DONE',
        completedById: ME,
        completedByName: 'Pat',
      });
      const mop = occurrence(3, 'Mop', '2026-11-11');
      const { element } = await render((from, to) => of(schedule(from, to, [vacuum, dishes, mop])));
      const meta = (name: string) =>
        [...element.querySelectorAll('.occurrence')].find((row) => row.querySelector('.name')?.textContent === name)!.querySelector('.meta')!;

      expect(meta('Vacuum').querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
      expect(meta('Vacuum').querySelector('.assignee .visually-hidden')?.textContent).toBe('Assigned to ');
      expect(meta('Dishes').textContent).toContain('Done by Pat');
      expect(meta('Dishes').querySelector('.assignee')).toBeNull();
      // Anyone shows nothing
      expect(meta('Mop').querySelector('.assignee')).toBeNull();
    });

    it("asks who's doing it, with the day's assignee chosen, and assigns that day", async () => {
      const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
      const { schedules, element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        undefined,
        undefined,
        undefined,
        undefined,
        (id, assigneeId) => of({ ...vacuum, assigneeId, assigneeName: assigneeId === 2 ? 'Sam Ray' : null }),
      );

      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Assign: Vacuum');
      expect(sheetOpen(element)).toBe(true);
      expect(assignSheet(element).textContent).toContain("Who's doing Vacuum on Wednesday, Nov 11?");
      expect(choices(element)).toEqual([
        { name: 'Anyone', checked: true },
        { name: 'Pat Lee', checked: false },
        { name: 'Sam Ray', checked: false },
      ]);

      await choose(element, fixture, 'Sam Ray');
      await confirm(element, fixture);

      expect(schedules.assign).toHaveBeenCalledWith(1, 2);
      expect(sheetOpen(element)).toBe(false);
      expect(element.querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
      expect(TestBed.inject(Toast).message()).toBe('Vacuum on Wednesday, Nov 11: Sam.');
    });

    it('can set a day back to Anyone', async () => {
      const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { assigneeId: 2, assigneeName: 'Sam Ray' });
      const { schedules, element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        undefined,
        undefined,
        undefined,
        undefined,
        () => of({ ...vacuum, assigneeId: null, assigneeName: null }),
      );

      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Assign: Vacuum');
      expect(choices(element).find((c) => c.checked)?.name).toBe('Sam Ray');
      await choose(element, fixture, 'Anyone');
      await confirm(element, fixture);

      expect(schedules.assign).toHaveBeenCalledWith(1, null);
      expect(element.querySelector('.assignee')).toBeNull();
      expect(TestBed.inject(Toast).message()).toBe('Vacuum on Wednesday, Nov 11: Anyone.');
    });

    it("undo puts a day that followed its task back to following it", async () => {
      // Sam through the task, not the day's own choice
      const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { assigneeId: 2, assigneeName: 'Sam Ray' });
      const { schedules, element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        undefined,
        undefined,
        undefined,
        undefined,
        () => of({ ...vacuum, assigneeId: ME, assigneeName: 'Pat Lee', assignmentSet: true }),
        () => of(vacuum),
      );

      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Assign: Vacuum');
      await choose(element, fixture, 'Pat Lee');
      await confirm(element, fixture);
      const toast = TestBed.inject(Toast);
      expect(toast.action()?.label).toBe('Undo');

      toast.act();
      await fixture.whenStable();

      expect(schedules.followTask).toHaveBeenCalledWith(1);
      expect(schedules.assign).toHaveBeenCalledTimes(1);
      expect(element.querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
      expect(toast.message()).toBe('Vacuum on Wednesday, Nov 11: back to Sam.');
      expect(toast.action()).toBeNull();
    });

    it("undo gives a day with its own assignee that assignee back", async () => {
      const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { assigneeId: 2, assigneeName: 'Sam Ray', assignmentSet: true });
      const { schedules, element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [vacuum])),
        undefined,
        undefined,
        undefined,
        undefined,
        (id, assigneeId) =>
          of({ ...vacuum, assigneeId, assigneeName: assigneeId === 2 ? 'Sam Ray' : null, assignmentSet: true }),
      );

      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Assign: Vacuum');
      await choose(element, fixture, 'Anyone');
      await confirm(element, fixture);
      TestBed.inject(Toast).act();
      await fixture.whenStable();

      expect(schedules.assign).toHaveBeenLastCalledWith(1, 2);
      expect(schedules.followTask).not.toHaveBeenCalled();
      expect(element.querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
    });
  });

  describe('moving a day with the menu (BILLIAMVT-56)', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
    const withVacuum = (from: string, to: string) => of(schedule(from, to, [vacuum]));
    const moveSheet = (element: HTMLElement) => element.querySelectorAll<HTMLDialogElement>('dialog.sheet')[1];
    const inSheet = (element: HTMLElement, text: string) =>
      [...moveSheet(element).querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
    const dateField = (element: HTMLElement) => element.querySelector<HTMLInputElement>('#move-date')!;
    const notice = (element: HTMLElement) => element.querySelector('.notice[role="status"]')?.textContent?.trim();
    const openMove = async (click: (name: string) => Promise<void>) => {
      await click('More for Vacuum on Wednesday, Nov 11');
      await click('Move: Vacuum');
    };
    const pick = async (element: HTMLElement, fixture: { whenStable: () => Promise<unknown> }, date: string) => {
      const field = dateField(element);
      field.value = date;
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };

    it("is in a pending day's menu, for recurring tasks and one-off items, but not done days", async () => {
      const done = occurrence(2, 'Dishes', '2026-11-11', { status: 'DONE', completedById: ME, completedByName: 'Pat' });
      const shelves = occurrence(3, 'Hang shelves', '2026-11-11', { oneOff: true });
      const { element, click } = await render((from, to) => of(schedule(from, to, [vacuum, done, shelves])));
      const menu = () => [...element.querySelectorAll('.menu button')].map((b) => b.textContent?.trim());

      await click('More for Vacuum on Wednesday, Nov 11');
      expect(menu()).toEqual(['Move', 'Assign', 'Skip', 'Delete']);
      await click('More for Dishes on Wednesday, Nov 11');
      expect(menu()).toEqual(['Delete']);
      await click('More for Hang shelves on Wednesday, Nov 11');
      expect(menu()).toEqual(['Move', 'Assign', 'Back to backlog', 'Delete']);
    });

    it('asks for a day, from today to the viewing limit, starting on the day it is on', async () => {
      const { element, click } = await render(withVacuum);

      await openMove(click);

      expect(sheetOpen(element)).toBe(true);
      expect(sheetMessage(element)).toBe('Move Vacuum from Wednesday, Nov 11 to:');
      expect(dateField(element).value).toBe('2026-11-11');
      expect(dateField(element).min).toBe('2026-11-11');
      expect(dateField(element).max).toBe('2028-11-11');
      expect(inSheet(element, 'Move').classList).toContain('primary');
      expect(element.querySelector('.menu')).toBeNull();
    });

    it('moves the row to its new day in this week, and says so', async () => {
      const { schedules, element, click, fixture } = await render(withVacuum, undefined, undefined, undefined, (id, date) =>
        of({ ...vacuum, date }),
      );
      await openMove(click);
      await pick(element, fixture, '2026-11-13');

      inSheet(element, 'Move').click();
      await fixture.whenStable();

      expect(schedules.move).toHaveBeenCalledWith(1, '2026-11-13');
      expect(sheetOpen(element)).toBe(false);
      expect(element.querySelectorAll('.day')[3].querySelector('.occurrence')).toBeNull();
      expect(element.querySelectorAll('.day')[5].querySelector('.occurrence')?.textContent).toContain('Vacuum');
      expect(TestBed.inject(Toast).message()).toBe('Vacuum moved to Friday, Nov 13.');
    });

    it('takes the row off this week when it moves to another week', async () => {
      const { element, click, fixture } = await render(withVacuum, undefined, undefined, undefined, (id, date) =>
        of({ ...vacuum, date }),
      );
      await openMove(click);
      await pick(element, fixture, '2026-11-20');

      inSheet(element, 'Move').click();
      await fixture.whenStable();

      expect(element.querySelector('.occurrence')).toBeNull();
      expect(TestBed.inject(Toast).message()).toBe('Vacuum moved to Friday, Nov 20.');
    });

    it('Undo puts a row moved to another week back on its day', async () => {
      const { schedules, element, click, fixture } = await render(withVacuum, undefined, undefined, undefined, (id, date) =>
        of({ ...vacuum, date }),
      );
      await openMove(click);
      await pick(element, fixture, '2026-11-20');
      inSheet(element, 'Move').click();
      await fixture.whenStable();

      TestBed.inject(Toast).act();
      await fixture.whenStable();

      expect(schedules.move).toHaveBeenLastCalledWith(1, '2026-11-11');
      expect(element.querySelectorAll('.day')[3].querySelector('.occurrence')?.textContent).toContain('Vacuum');
      expect(TestBed.inject(Toast).message()).toBe('Vacuum moved back to Wednesday, Nov 11.');
    });

    it("shows the server's message in the sheet, which stays open", async () => {
      const { element, click, fixture } = await render(withVacuum, undefined, undefined, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 400, error: { detail: 'Pick today or a later day.' } })),
      );
      await openMove(click);

      inSheet(element, 'Move').click();
      await fixture.whenStable();

      expect(sheetOpen(element)).toBe(true);
      expect(moveSheet(element).querySelector('[role="alert"]')?.textContent).toBe('Pick today or a later day.');
    });

    it('needs a day', async () => {
      const { schedules, element, click, fixture } = await render(withVacuum);
      await openMove(click);
      await pick(element, fixture, '');

      inSheet(element, 'Move').click();
      await fixture.whenStable();

      expect(schedules.move).not.toHaveBeenCalled();
      expect(moveSheet(element).querySelector('[role="alert"]')?.textContent).toBe('Choose a day.');
    });

    it('reloads the week with a notice when the day changed meanwhile (BILLIAMVT-55)', async () => {
      let calls = 0;
      const doneBySam = { ...vacuum, status: 'DONE' as const, completedById: 2, completedByName: 'Sam' };
      const { element, click, fixture } = await render(
        (from, to) => of(schedule(from, to, [calls++ === 0 ? vacuum : doneBySam])),
        undefined,
        undefined,
        undefined,
        () => throwError(() => new HttpErrorResponse({ status: 409 })),
      );
      await openMove(click);

      inSheet(element, 'Move').click();
      await fixture.whenStable();

      expect(sheetOpen(element)).toBe(false);
      expect(notice(element)).toBe('Sam already marked Vacuum done. Your week is up to date.');
    });

    it('cancels, and focus goes back to the ⋯ button', async () => {
      const { schedules, element, click, fixture } = await render(withVacuum);
      await openMove(click);

      inSheet(element, 'Cancel').click();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));

      expect(schedules.move).not.toHaveBeenCalled();
      expect(sheetOpen(element)).toBe(false);
      expect(document.activeElement?.getAttribute('aria-label')).toBe('More for Vacuum on Wednesday, Nov 11');
    });
  });

  describe('dragging a day to another day (BILLIAMVT-28)', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
    const done = occurrence(2, 'Dishes', '2026-11-11', { status: 'DONE', completedById: ME, completedByName: 'Pat' });
    const gone = occurrence(3, 'Old chore', '2026-11-11', { taskDeleted: true });
    const withRows = (from: string, to: string) => of(schedule(from, to, [vacuum, done, gone]));
    const notice = (element: HTMLElement) => element.querySelector('.notice[role="status"]')?.textContent?.trim();
    const rowsOn = (element: HTMLElement, index: number) =>
      [...element.querySelectorAll('.day')[index].querySelectorAll('.occurrence .name')].map((n) => n.textContent);
    /** What the CDK passes on a drop, from Wednesday Nov 11 to {@code date}; over the day unless said */
    const drop = (component: unknown, item: ScheduledOccurrence, date: string, isPointerOverContainer = true) =>
      (component as { dropped(e: unknown): void }).dropped({
        item: { data: item },
        container: { data: date },
        previousContainer: { data: item.date },
        isPointerOverContainer,
      });

    it('is off while the flag is off: no row can be dragged', async () => {
      const { element } = await render(withRows);
      expect(element.querySelectorAll('.occurrence.draggable')).toHaveLength(0);
    });

    it("with the flag on, only pending days of tasks that still exist can be dragged", async () => {
      dragDrop.set(true);
      const { element } = await render(withRows);
      const draggable = [...element.querySelectorAll('.occurrence.draggable .name')].map((n) => n.textContent);
      expect(draggable).toEqual(['Vacuum']);
    });

    it('only accepts drops on today or later', async () => {
      dragDrop.set(true);
      const { fixture } = await render(withRows);
      const accepts = (fixture.componentInstance as unknown as {
        acceptsDrop: (drag: unknown, list: { data: string }) => boolean;
      }).acceptsDrop;
      expect(accepts(null, { data: '2026-11-10' })).toBe(false);
      expect(accepts(null, { data: '2026-11-11' })).toBe(true);
      expect(accepts(null, { data: '2026-11-14' })).toBe(true);
    });

    it('moves the row at once, saves it with the move API, and says so', async () => {
      dragDrop.set(true);
      const { schedules, element, fixture } = await render(withRows, undefined, undefined, undefined, (id, date) =>
        of({ ...vacuum, date }),
      );

      drop(fixture.componentInstance, vacuum, '2026-11-13');
      await fixture.whenStable();

      expect(schedules.move).toHaveBeenCalledWith(1, '2026-11-13');
      expect(rowsOn(element, 3)).not.toContain('Vacuum');
      expect(rowsOn(element, 5)).toEqual(['Vacuum']);
      expect(TestBed.inject(Toast).message()).toBe('Vacuum moved to Friday, Nov 13.');
    });

    it('offers Undo, which moves the row back to its day and place', async () => {
      dragDrop.set(true);
      const { schedules, element, fixture } = await render(withRows, undefined, undefined, undefined, (id, date) =>
        of({ ...vacuum, date }),
      );
      drop(fixture.componentInstance, vacuum, '2026-11-13');
      await fixture.whenStable();
      const toast = TestBed.inject(Toast);
      expect(toast.action()?.label).toBe('Undo');

      toast.act();
      await fixture.whenStable();

      expect(schedules.move).toHaveBeenLastCalledWith(1, '2026-11-11');
      expect(rowsOn(element, 3)).toEqual(['Vacuum', 'Dishes', 'Old chore']);
      expect(rowsOn(element, 5)).toEqual([]);
      expect(toast.message()).toBe('Vacuum moved back to Wednesday, Nov 11.');
      expect(toast.action()).toBeNull();
    });

    it('offers no Undo for an overdue day moved forward: it can\'t go back to the past', async () => {
      dragDrop.set(true);
      const mop = occurrence(4, 'Mop', '2026-11-10', { overdue: true });
      const { fixture } = await render(
        (from, to) => of(schedule(from, to, [mop])),
        undefined,
        undefined,
        undefined,
        (id, date) => of({ ...mop, date, overdue: false }),
      );

      drop(fixture.componentInstance, mop, '2026-11-12');
      await fixture.whenStable();

      expect(TestBed.inject(Toast).message()).toBe('Mop moved to Thursday, Nov 12.');
      expect(TestBed.inject(Toast).action()).toBeNull();
    });

    it("stops the page scrolling only while a row is dragged (iPhone Safari)", async () => {
      dragDrop.set(true);
      const { fixture } = await render(withRows);
      const touchMove = () => {
        const event = new Event('touchmove', { cancelable: true });
        document.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const component = fixture.componentInstance as unknown as { dragFrom: { set(date: string | null): void } };

      expect(touchMove()).toBe(false);
      component.dragFrom.set('2026-11-11');
      expect(touchMove()).toBe(true);
      component.dragFrom.set(null);
      expect(touchMove()).toBe(false);
    });

    it('also stops it once a hold on a draggable row is complete, before the drag starts (iPhone Safari)', async () => {
      dragDrop.set(true);
      const { element } = await render(withRows);
      vi.useFakeTimers();
      try {
        const touch = (type: string, target: EventTarget) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          // A full touch point: the CDK's own listener on the row reads it too
          const point = { clientX: 10, clientY: 10, pageX: 10, pageY: 10, screenX: 10, screenY: 10, identifier: 0, target };
          const down = type === 'touchstart' || type === 'touchmove' ? [point] : [];
          Object.defineProperty(event, 'touches', { value: down });
          Object.defineProperty(event, 'targetTouches', { value: down });
          Object.defineProperty(event, 'changedTouches', { value: [point] });
          target.dispatchEvent(event);
          return event.defaultPrevented;
        };
        const row = element.querySelector('.occurrence.draggable .name')!;
        const other = element.querySelector('.occurrence:not(.draggable)')!;

        // A swipe that moves before the hold is up scrolls, and stays a scroll
        touch('touchstart', row);
        expect(touch('touchmove', row)).toBe(false);
        vi.advanceTimersByTime(200);
        expect(touch('touchmove', row)).toBe(false);
        touch('touchend', row);

        // Held still for the hold time: the first small move no longer scrolls
        touch('touchstart', row);
        vi.advanceTimersByTime(200);
        expect(touch('touchmove', row)).toBe(true);
        touch('touchend', row);
        expect(touch('touchmove', row)).toBe(false);

        // Rows that can't be dragged never stop scrolling
        touch('touchstart', other);
        vi.advanceTimersByTime(200);
        expect(touch('touchmove', other)).toBe(false);
        touch('touchend', other);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does nothing when let go outside any day, e.g. below the week', async () => {
      dragDrop.set(true);
      const { schedules, element, fixture } = await render(withRows);

      // The CDK still has it in Saturday, the last day it passed over
      drop(fixture.componentInstance, vacuum, '2026-11-14', false);
      await fixture.whenStable();

      expect(schedules.move).not.toHaveBeenCalled();
      expect(rowsOn(element, 3)).toContain('Vacuum');
      expect(rowsOn(element, 6)).toEqual([]);
    });

    it('does nothing when dropped back on its own day', async () => {
      dragDrop.set(true);
      const { schedules, fixture } = await render(withRows);

      drop(fixture.componentInstance, vacuum, '2026-11-11');

      expect(schedules.move).not.toHaveBeenCalled();
    });

    it('puts the row back and shows why when saving fails', async () => {
      dragDrop.set(true);
      const { element, fixture } = await render(withRows, undefined, undefined, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 400, error: { detail: 'Pick today or a later day.' } })),
      );

      drop(fixture.componentInstance, vacuum, '2026-11-13');
      await fixture.whenStable();

      expect(rowsOn(element, 3)).toContain('Vacuum');
      expect(rowsOn(element, 5)).toEqual([]);
      expect(element.querySelector('.item-error')?.textContent).toBe('Pick today or a later day.');
    });

    it('reloads the week with a notice when the day changed meanwhile (BILLIAMVT-55)', async () => {
      dragDrop.set(true);
      let calls = 0;
      const doneBySam = { ...vacuum, status: 'DONE' as const, completedById: 2, completedByName: 'Sam' };
      const { element, fixture } = await render(
        (from, to) => of(schedule(from, to, [calls++ === 0 ? vacuum : doneBySam])),
        undefined,
        undefined,
        undefined,
        () => throwError(() => new HttpErrorResponse({ status: 409 })),
      );

      drop(fixture.componentInstance, vacuum, '2026-11-13');
      await fixture.whenStable();

      expect(notice(element)).toBe('Sam already marked Vacuum done. Your week is up to date.');
      expect(rowsOn(element, 3)).toEqual(['Vacuum']);
    });
  });

  it('shows the week once a household exists and it reloads (BILLIAMVT-47)', async () => {
    let household = false;
    const { element, fixture } = await render((from, to) =>
      household ? of(schedule(from, to)) : throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    expect(element.querySelector('.week')).toBeNull();

    household = true;
    fixture.componentInstance.reload();
    await fixture.whenStable();

    expect(element.querySelector('.week')).not.toBeNull();
  });
});
