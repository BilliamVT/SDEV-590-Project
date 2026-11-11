import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { NEVER, Observable, of, throwError } from 'rxjs';

import { Schedule, ScheduledOccurrence } from './schedule.models';
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

  async function render(between: (from: string, to: string) => Observable<Schedule> = (from, to) => of(schedule(from, to))) {
    const schedules = { between: vi.fn(between) };
    await TestBed.configureTestingModule({
      imports: [WeekView],
      providers: [{ provide: ScheduleService, useValue: schedules }],
    }).compileComponents();
    const fixture = TestBed.createComponent(WeekView);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (text: string) => {
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    const button = (text: string) => [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
    return { schedules, element, click, button };
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
});
