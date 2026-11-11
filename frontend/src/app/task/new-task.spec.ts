import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { CreateTaskRequest, Task } from './task.models';
import { NewTask } from './new-task';
import { TaskService } from './task.service';

const savedTask = (request: CreateTaskRequest): Task => ({
  id: 1,
  name: request.name,
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=SA',
  schedule: 'Every week on Saturday',
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

  async function render(create: (request: CreateTaskRequest) => Observable<Task> = (r) => of(savedTask(r))) {
    const tasks = { create: vi.fn(create) };
    await TestBed.configureTestingModule({
      imports: [NewTask],
      providers: [provideRouter([]), { provide: TaskService, useValue: tasks }],
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
    return { tasks, router, element, set, submit, click };
  }

  it('creates a weekly task with only the fields it needs, then shows the week', async () => {
    const { tasks, router, set, submit } = await render();
    await set('task-name', '  Vacuum  ');
    await set('task-frequency', 'WEEKLY');
    await set('task-day', 'SATURDAY');
    await set('task-minutes', '30');
    await submit();

    expect(tasks.create).toHaveBeenCalledWith({ name: 'Vacuum', frequency: 'WEEKLY', dayOfWeek: 'SATURDAY', estimatedMinutes: 30 });
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

  it('previews when a task with a start date first happens', async () => {
    const { element, set } = await render();
    const preview = () => element.querySelector('.preview')?.textContent;

    // Wednesday Nov 4, 2026, every 2 weeks on Sunday: this coming Sunday
    await set('task-frequency', 'EVERY_N_WEEKS');
    await set('task-day', 'SUNDAY');
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
});
