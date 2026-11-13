import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';

import { CreateTaskRequest, Task } from './task.models';
import { Household } from '../household/household.models';
import { HouseholdService } from '../household/household.service';
import { toIsoDate } from '../schedule/dates';
import { NewTask } from './new-task';
import { TaskService } from './task.service';

const savedTask = (request: CreateTaskRequest): Task => ({
  id: 1,
  name: request.name,
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA',
  schedule: 'Every week on Saturday',
  frequency: request.frequency,
  interval: request.interval ?? null,
  daysOfWeek: request.daysOfWeek ?? null,
  dayOfMonth: request.dayOfMonth ?? null,
  startsOn: '2026-11-04',
  estimatedMinutes: request.estimatedMinutes ?? null,
  active: true,
});

describe('NewTask', () => {
  // A fixed "today" (Wednesday Nov 4, 2026), so start dates and previews don't depend on when tests run
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 12));
  });
  afterEach(() => vi.useRealTimers());

  /** The household's time zone already known, and its today the same as the device's */
  const knownHousehold = () => ({ timeZoneKnown: () => true, today: () => toIsoDate(new Date()), load: vi.fn() });

  async function render(
    create: (request: CreateTaskRequest) => Observable<Task> = (r) => of(savedTask(r)),
    households: object = knownHousehold(),
  ) {
    const tasks = { create: vi.fn(create) };
    await TestBed.configureTestingModule({
      imports: [NewTask],
      providers: [provideRouter([]), { provide: TaskService, useValue: tasks }, { provide: HouseholdService, useValue: households }],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NewTask);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const set = async (id: string, value: string) => {
      const field = element.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)!;
      field.value = value;
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    const click = async (text: string) => {
      [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!.click();
      await fixture.whenStable();
    };
    /** Taps a day toggle by its full name, e.g. 'Saturday' */
    const toggle = async (day: string) => {
      element.querySelector<HTMLButtonElement>(`#task-day button[aria-label="${day}"]`)!.click();
      await fixture.whenStable();
    };
    return { tasks, router, fixture, element, set, submit, click, toggle };
  }

  it('creates a weekly task with only the fields it needs, then shows the week', async () => {
    const { tasks, router, set, submit, toggle } = await render();
    await set('task-name', '  Vacuum  ');
    await set('task-frequency', 'WEEKLY');
    await toggle('Saturday');
    await set('task-minutes', '30');
    await submit();

    expect(tasks.create).toHaveBeenCalledWith({ name: 'Vacuum', frequency: 'WEEKLY', daysOfWeek: ['SATURDAY'], estimatedMinutes: 30 });
    expect(router.navigate).toHaveBeenCalledWith(['/'], {
      state: { savedTask: { name: 'Vacuum', schedule: 'every week on Saturday' } },
    });
  });

  it('shows only the fields each frequency uses', async () => {
    const { element, set } = await render();
    const shown = () => ['task-interval', 'task-day', 'task-day-of-month', 'task-start'].filter((id) => element.querySelector(`#${id}`));

    await set('task-frequency', 'DAILY');
    expect(shown()).toEqual([]);
    await set('task-frequency', 'EVERY_N_WEEKS');
    expect(shown()).toEqual(['task-interval', 'task-day', 'task-start']);
    await set('task-frequency', 'MONTHLY');
    expect(shown()).toEqual(['task-day-of-month']);
    await set('task-frequency', 'QUARTERLY');
    expect(shown()).toEqual(['task-start']);
  });

  it('sends every-N-days tasks with their interval and start date', async () => {
    const { tasks, set, submit } = await render();
    await set('task-name', 'Water plants');
    await set('task-frequency', 'EVERY_N_DAYS');
    await set('task-interval', '10');
    await set('task-start', '2026-11-07');
    await submit();

    expect(tasks.create).toHaveBeenCalledWith({ name: 'Water plants', frequency: 'EVERY_N_DAYS', interval: 10, startsOn: '2026-11-07' });
  });

  describe("the household's today (BILLIAMVT-51)", () => {
    /** Opened by a link or a reload: the time zone arrives with the household, a day ahead of the device */
    function unknownHousehold(arrives: Observable<Household | null>) {
      // Signals, as in HouseholdService, so the page updates when the household arrives
      const zone = signal<string | null>(null);
      const load = vi.fn(() => {
        arrives.subscribe(() => zone.set('a day ahead'));
        return arrives;
      });
      return { timeZoneKnown: () => zone() !== null, today: () => (zone() ? '2026-11-05' : '2026-11-04'), load };
    }

    it("loads the household, then starts on its today and doesn't allow earlier", async () => {
      const arrives = new Subject<Household | null>();
      const households = unknownHousehold(arrives);
      const { fixture, element, set } = await render(undefined, households);
      await set('task-frequency', 'EVERY_N_DAYS');
      expect(households.load).toHaveBeenCalledTimes(1);

      arrives.next(null);
      arrives.complete();
      await fixture.whenStable();
      const start = element.querySelector<HTMLInputElement>('#task-start')!;
      expect(start.value).toBe('2026-11-05');
      expect(start.min).toBe('2026-11-05');
    });

    it('keeps a start date the user already chose', async () => {
      const arrives = new Subject<Household | null>();
      const { fixture, element, set } = await render(undefined, unknownHousehold(arrives));
      await set('task-frequency', 'EVERY_N_DAYS');
      await set('task-start', '2026-11-20');

      arrives.next(null);
      arrives.complete();
      await fixture.whenStable();
      expect(element.querySelector<HTMLInputElement>('#task-start')!.value).toBe('2026-11-20');
    });

    it("doesn't load the household again when its time zone is known", async () => {
      const households = knownHousehold();
      await render(undefined, households);
      expect(households.load).not.toHaveBeenCalled();
    });
  });

  it('previews when a task with a start date first happens', async () => {
    const { element, set, toggle } = await render();
    const preview = () => element.querySelector('.preview')?.textContent;

    // Wednesday Nov 4, 2026, every 2 weeks on Sunday: this coming Sunday
    await set('task-frequency', 'EVERY_N_WEEKS');
    await toggle('Sunday');
    await set('task-start', '2026-11-04');
    expect(preview()).toBe('First time: Sunday, Nov 8, 2026, then every 2 weeks.');

    // Starting a week and a half later moves the first time with it
    await set('task-start', '2026-11-13');
    expect(preview()).toBe('First time: Sunday, Nov 15, 2026, then every 2 weeks.');

    await set('task-frequency', 'EVERY_N_DAYS');
    await set('task-interval', '10');
    expect(preview()).toBe('First time: Friday, Nov 13, 2026, then every 10 days.');

    await set('task-frequency', 'QUARTERLY');
    await set('task-start', '2026-12-31');
    expect(preview()).toBe('First time: Thursday, Dec 31, 2026, then every 3 months on the last day.');
    await set('task-start', '2026-11-15');
    expect(preview()).toBe('First time: Sunday, Nov 15, 2026, then every 3 months.');
  });

  it("doesn't allow a start date in the past", async () => {
    const { tasks, element, set, submit } = await render();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    await set('task-name', 'Water plants');
    await set('task-frequency', 'EVERY_N_DAYS');
    expect(element.querySelector<HTMLInputElement>('#task-start')?.min).toBe(iso(new Date()));
    await set('task-start', iso(yesterday));
    await submit();

    expect(tasks.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Choose a start date from today on.');
    expect(element.querySelector('.preview')).toBeNull();
  });

  it('hides the preview until the interval is valid', async () => {
    const { element, set } = await render();
    await set('task-frequency', 'EVERY_N_DAYS');
    await set('task-interval', '1');
    expect(element.querySelector('.preview')).toBeNull();
  });

  it('offers days 1 to 28 and the last day for monthly tasks', async () => {
    const { tasks, element, set, submit } = await render();
    await set('task-name', 'Pay rent');
    await set('task-frequency', 'MONTHLY');
    const options = [...element.querySelectorAll('#task-day-of-month option')].map((o) => o.textContent);
    expect(options).toHaveLength(29);
    expect(options.at(-1)).toBe('Last day');

    await set('task-day-of-month', '-1');
    await submit();
    expect(tasks.create).toHaveBeenCalledWith({ name: 'Pay rent', frequency: 'MONTHLY', dayOfMonth: -1 });
  });

  it('checks the name and the interval limits before saving', async () => {
    const { tasks, element, set, submit } = await render();
    await set('task-frequency', 'EVERY_N_WEEKS');
    await set('task-interval', '53');
    await submit();

    expect(tasks.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Enter a task name');
    expect(element.textContent).toContain('Enter a whole number from 2 to 52.');
  });

  it("shows the server's reason when it rejects the task", async () => {
    const rejected = new HttpErrorResponse({ status: 400, error: { detail: 'Choose a start date within a year of today.' } });
    const { element, set, submit } = await render(() => throwError(() => rejected));
    await set('task-name', 'Gutters');
    await set('task-frequency', 'QUARTERLY');
    await set('task-start', '2030-01-01');
    await submit();

    expect(element.textContent).toContain('Choose a start date within a year of today.');
  });

  describe('several days a week (BILLIAMVT-50)', () => {
    it('sends the chosen days Sunday first, and untaps a day', async () => {
      const { tasks, element, set, submit, toggle } = await render();
      await set('task-name', 'Litter box');
      await set('task-frequency', 'WEEKLY');
      for (const day of ['Monday', 'Friday', 'Sunday', 'Tuesday', 'Wednesday', 'Thursday']) {
        await toggle(day);
      }
      await toggle('Tuesday');

      const pressed = [...element.querySelectorAll('#task-day button')].map((b) => b.getAttribute('aria-pressed'));
      expect(pressed).toEqual(['true', 'true', 'false', 'true', 'true', 'true', 'false']);
      await submit();

      expect(tasks.create).toHaveBeenCalledWith({
        name: 'Litter box',
        frequency: 'WEEKLY',
        daysOfWeek: ['SUNDAY', 'MONDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      });
    });

    it('needs at least one day', async () => {
      const { tasks, element, set, submit } = await render();
      await set('task-name', 'Laundry');
      await set('task-frequency', 'WEEKLY');
      await submit();

      expect(tasks.create).not.toHaveBeenCalled();
      expect(element.querySelector('.field-error')?.textContent).toBe('Choose at least one day.');
    });

    it('previews the earliest chosen day on or after the start', async () => {
      const { element, set, toggle } = await render();
      // Wednesday Nov 4: Monday is already past this week, so Thursday Nov 5 comes first
      await set('task-frequency', 'EVERY_N_WEEKS');
      await toggle('Monday');
      await toggle('Thursday');
      await set('task-start', '2026-11-04');

      expect(element.querySelector('.preview')?.textContent).toBe('First time: Thursday, Nov 5, 2026, then every 2 weeks.');
    });
  });
});
