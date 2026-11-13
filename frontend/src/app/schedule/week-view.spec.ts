import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { BacklogService } from '../backlog/backlog.service';
import { OccurrenceStatus, Schedule, ScheduledOccurrence } from './schedule.models';
import { ScheduleService } from './schedule.service';
import { WeekView } from './week-view';

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
  completedAt: null,
  oneOff: false,
  ...extra,
});

const schedule = (from: string, to: string, occurrences: ScheduledOccurrence[] = [], lastViewableDate = '2028-11-11'): Schedule => ({
  from,
  to,
  today: '2026-11-11',
  lastViewableDate,
  occurrences,
});

describe('WeekView', () => {
  // Wednesday Nov 11, 2026: this week runs Sunday Nov 8 to Saturday Nov 14
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 12));
  });
  afterEach(() => vi.useRealTimers());

  async function render(
    between: (from: string, to: string) => Observable<Schedule> = (from, to) => of(schedule(from, to)),
    changeStatus: (id: number, status: OccurrenceStatus) => Observable<ScheduledOccurrence> = () => NEVER,
    remove: (id: number) => Observable<void> = () => of(undefined),
    deleteItem: (id: number) => Observable<void> = () => of(undefined),
  ) {
    const schedules = { between: vi.fn(between), changeStatus: vi.fn(changeStatus), delete: vi.fn(remove) };
    const backlog = { delete: vi.fn(deleteItem) };
    await TestBed.configureTestingModule({
      imports: [WeekView],
      providers: [
        { provide: ScheduleService, useValue: schedules },
        { provide: BacklogService, useValue: backlog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(WeekView);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    const button = (text: string) => [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
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

  describe('marking done or skipped', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11');
    const withVacuum = (from: string, to: string) => of(schedule(from, to, [vacuum]));
    const labelOf = (element: HTMLElement) => element.querySelector('.status-label')?.textContent?.trim();

    it('marks a task done and shows who did it', async () => {
      const { schedules, element, click } = await render(withVacuum, (id, status) =>
        of({ ...vacuum, status, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' }),
      );

      await click('Done');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'DONE');
      expect(element.querySelector('.occurrence')?.getAttribute('data-status')).toBe('DONE');
      expect(labelOf(element)).toBe('✓ Done by Pat');
      expect(element.querySelector('button[aria-label="Undo Vacuum"]')).not.toBeNull();
    });

    it('skips a task', async () => {
      const { schedules, element, click } = await render(withVacuum, (id, status) =>
        of({ ...vacuum, status, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' }),
      );

      await click('Skip');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'SKIPPED');
      expect(labelOf(element)).toBe('Skipped by Pat');
    });

    it('tells the page when a status changes, so the backlog can reload (BILLIAMVT-23)', async () => {
      const { fixture, click } = await render(withVacuum, (id, status) => of({ ...vacuum, status }));
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await click('Skip');

      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('undoes back to pending', async () => {
      const done = { ...vacuum, status: 'DONE' as const, completedByName: 'Pat', completedAt: '2026-11-11T17:00:00Z' };
      const { schedules, element, click } = await render(
        (from, to) => of(schedule(from, to, [done])),
        () => of(vacuum),
      );

      await click('Undo');

      expect(schedules.changeStatus).toHaveBeenCalledWith(1, 'PENDING');
      expect(labelOf(element)).toBeUndefined();
      expect(element.querySelector('button[aria-label="Mark Vacuum done"]')).not.toBeNull();
    });

    it('disables the buttons while saving', async () => {
      const { element, click, button } = await render(withVacuum);

      await click('Done');

      expect(button('Done').disabled).toBe(true);
      expect(button('Skip').disabled).toBe(true);
      expect(element.querySelector('.occurrence')?.getAttribute('data-status')).toBe('PENDING');
    });

    it('shows an error on the item when saving fails', async () => {
      const { element, click, button } = await render(withVacuum, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await click('Done');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
      expect(button('Done').disabled).toBe(false);
    });
  });

  describe('deleting one day', () => {
    const vacuum = occurrence(1, 'Vacuum', '2026-11-11', { status: 'DONE', taskDeleted: true, completedByName: 'Pat' });
    const withVacuum = (from: string, to: string) => of(schedule(from, to, [vacuum]));
    afterEach(() => vi.restoreAllMocks());

    it('asks first, then removes it from the week', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { schedules, element, click } = await render(withVacuum);

      await click('Delete');

      expect(confirm).toHaveBeenCalledWith(
        'Delete "Vacuum" on Wednesday, Nov 11 for good? This only removes this day, and it can\'t be undone.',
      );
      expect(schedules.delete).toHaveBeenCalledWith(1);
      expect(element.querySelector('.occurrence')).toBeNull();
      expect(element.querySelectorAll('.day')[3].querySelector('.empty')?.textContent).toBe('Nothing scheduled');
    });

    it('tells the page after deleting, and reloads when asked (BILLIAMVT-23)', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { schedules, fixture, click } = await render(withVacuum);
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await click('Delete');
      expect(changed).toHaveBeenCalledTimes(1);

      fixture.componentInstance.reload();
      expect(schedules.between).toHaveBeenCalledTimes(2);
    });

    it('does nothing if the user cancels', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { schedules, element, click } = await render(withVacuum);

      await click('Delete');

      expect(schedules.delete).not.toHaveBeenCalled();
      expect(element.querySelector('.occurrence')).not.toBeNull();
    });

    it('keeps it and shows an error when deleting fails', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { element, click } = await render(withVacuum, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await click('Delete');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
    });
  });

  describe("deleting a one-off item's day (BILLIAMVT-23)", () => {
    const shelves = occurrence(5, 'Hang shelves', '2026-11-11', { taskId: 9, oneOff: true });
    const withShelves = (from: string, to: string) => of(schedule(from, to, [shelves]));
    afterEach(() => vi.restoreAllMocks());

    it('has Done and Remove, but no Skip: skipping would only send it back to the backlog', async () => {
      const { button } = await render(withShelves);

      expect(button('Done')).toBeDefined();
      expect(button('Skip')).toBeUndefined();
      expect(button('Delete')).toBeUndefined();
      expect(button('Remove').getAttribute('aria-label')).toBe('Remove Hang shelves on Wednesday, Nov 11');
    });

    it('offers back to the backlog or for good, instead of the browser confirmation', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const { element, click, button } = await render(withShelves);

      await click('Remove');

      expect(confirm).not.toHaveBeenCalled();
      expect(element.querySelector('.delete-choice')?.getAttribute('aria-label')).toBe('Remove Hang shelves');
      expect(button('Back to backlog')).toBeDefined();
      expect(button('Delete for good')).toBeDefined();
      expect(button('Done')).toBeUndefined();

      await click('Cancel');
      expect(element.querySelector('.delete-choice')).toBeNull();
      expect(button('Done')).toBeDefined();
    });

    it('puts it back in the backlog by deleting only the day', async () => {
      const { schedules, backlog, element, fixture, click } = await render(withShelves);
      const changed = vi.fn();
      fixture.componentInstance.changed.subscribe(changed);

      await click('Remove');
      await click('Back to backlog');

      expect(schedules.delete).toHaveBeenCalledWith(5);
      expect(backlog.delete).not.toHaveBeenCalled();
      expect(element.querySelector('.occurrence')).toBeNull();
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('deletes the item and its days for good', async () => {
      const { schedules, backlog, element, click } = await render(withShelves);

      await click('Remove');
      await click('Delete for good');

      expect(backlog.delete).toHaveBeenCalledWith(9);
      expect(schedules.delete).not.toHaveBeenCalled();
      expect(element.querySelector('.occurrence')).toBeNull();
    });

    it('keeps the choice open and shows an error when it fails', async () => {
      const { element, click } = await render(withShelves, undefined, undefined, () =>
        throwError(() => new HttpErrorResponse({ status: 0 })),
      );

      await click('Remove');
      await click('Delete for good');

      expect(element.querySelector('.occurrence .item-error')?.textContent).toContain("couldn't be reached");
      expect(element.querySelector('.delete-choice')).not.toBeNull();
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
