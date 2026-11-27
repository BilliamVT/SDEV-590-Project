import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { signal } from '@angular/core';

import { Member } from '../household/household.models';
import { HouseholdService } from '../household/household.service';
import { Task } from './task.models';
import { TaskList } from './task-list';
import { TaskService } from './task.service';

const task = (id: number, name: string, extra: Partial<Task> = {}): Task => ({
  id,
  name,
  recurrenceRule: 'FREQ=DAILY',
  schedule: 'Every day',
  frequency: 'DAILY',
  interval: null,
  daysOfWeek: null,
  dayOfMonth: null,
  startsOn: '2026-11-11',
  estimatedMinutes: null,
  active: true,
  lastDone: null,
  assigneeId: null,
  color: null,
  ...extra,
});

/** The delete action sheet (BILLIAMVT-49): whether it's open, and what it asks. */
const sheetOpen = (element: HTMLElement) => element.querySelector('dialog.sheet')!.hasAttribute('open');
const sheetMessage = (element: HTMLElement) => element.querySelector('dialog.sheet .message')?.textContent?.trim();

describe('TaskList', () => {
  async function render(tasks: Task[], list: () => Observable<Task[]> = () => of(tasks)) {
    const service = {
      list: vi.fn(list),
      pause: vi.fn((id: number) => of({ ...tasks.find((t) => t.id === id)!, active: false })),
      resume: vi.fn((id: number) => of({ ...tasks.find((t) => t.id === id)!, active: true })),
      delete: vi.fn(() => of(undefined)),
    };
    // Members aren't known yet, as when Your tasks is opened straight from a link
    const members = signal<Member[] | null>(null);
    const households = {
      members,
      load: vi.fn(() => {
        members.set([
          { id: 1, displayName: 'Pat Lee' },
          { id: 2, displayName: 'Sam Ray' },
        ]);
        return of(null);
      }),
    };
    await TestBed.configureTestingModule({
      imports: [TaskList],
      providers: [provideRouter([]), { provide: TaskService, useValue: service }, { provide: HouseholdService, useValue: households }],
    }).compileComponents();
    const fixture = TestBed.createComponent(TaskList);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    // By the task's name, after any spoken color ("Teal: Dishes")
    const row = (name: string) =>
      [...element.querySelectorAll('.task')].find((r) => r.querySelector('.name')?.textContent?.trim().replace(/^.*: /, '') === name)!;
    const sheetButton = async (label: string) => {
      [...element.querySelectorAll<HTMLButtonElement>('dialog.sheet button')].find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    };
    const click = async (name: string, label: string) => {
      [...row(name).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    };
    return { service, fixture, element, row, click, sheetButton };
  }

  it("shows who each task is assigned to, by first name, and nothing for Anyone (BILLIAMVT-64)", async () => {
    const { row } = await render([task(1, 'Dishes', { assigneeId: 2 }), task(2, 'Vacuum')]);

    expect(row('Dishes').querySelector('.assignee')?.textContent).toBe('Assigned to Sam');
    expect(row('Dishes').querySelector('.assignee .visually-hidden')?.textContent).toBe('Assigned to ');
    expect(row('Vacuum').querySelector('.assignee')).toBeNull();
  });

  it("shows a task's color as a dot before its name, named for screen readers (BILLIAMVT-65)", async () => {
    const { row } = await render([task(1, 'Dishes', { color: 'TEAL' }), task(2, 'Vacuum')]);

    expect(row('Dishes').querySelector('.task-color-dot')?.getAttribute('data-color')).toBe('TEAL');
    expect(row('Dishes').querySelector('.task-color-dot')?.getAttribute('aria-hidden')).toBe('true');
    expect(row('Dishes').querySelector('.name')?.textContent?.trim()).toBe('Teal: Dishes');
    expect(row('Vacuum').querySelector('.task-color-dot')).toBeNull();
  });

  it('lists the tasks with their schedule, minutes and an edit link', async () => {
    const { row } = await render([task(1, 'Dishes', { estimatedMinutes: 15 }), task(2, 'Vacuum', { schedule: 'Every week on Saturday' })]);

    expect(row('Dishes').querySelector('.schedule')?.textContent).toContain('Every day');
    expect(row('Dishes').querySelector('.schedule')?.textContent).toContain('15 min');
    expect(row('Vacuum').querySelector('a')?.getAttribute('href')).toBe('/tasks/2/edit');
  });

  it('pauses and resumes a task', async () => {
    const { service, row, click } = await render([task(1, 'Dishes')]);

    await click('Dishes', 'Pause');
    expect(service.pause).toHaveBeenCalledWith(1);
    expect(row('Dishes').querySelector('.badge')?.textContent).toBe('Paused');

    await click('Dishes', 'Resume');
    expect(service.resume).toHaveBeenCalledWith(1);
    expect(row('Dishes').querySelector('.badge')).toBeNull();
  });

  it('says when each task was last done and by whom (BILLIAMVT-26)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 15, 12));
    try {
      const { row } = await render([
        task(1, 'Dishes', { lastDone: { date: '2026-11-12', byName: 'Sam' } }),
        task(2, 'Gutters', { lastDone: { date: '2025-08-30', byName: null } }),
        task(3, 'Windows'),
      ]);
      const line = (name: string) => row(name).querySelector('.last-done')?.textContent?.trim();

      expect(line('Dishes')).toBe('Last done Thu, Nov 12 by Sam');
      // Another year shows the year; a deleted account is "a former member"
      expect(line('Gutters')).toBe('Last done Sat, Aug 30, 2025 by a former member');
      expect(line('Windows')).toBe('Not done yet');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks before deleting', async () => {
    const { service, element, click, sheetButton } = await render([task(1, 'Dishes'), task(2, 'Vacuum')]);

    await click('Dishes', 'Delete');
    expect(service.delete).not.toHaveBeenCalled();
    expect(sheetOpen(element)).toBe(true);
    expect(sheetMessage(element)).toBe('Delete Dishes? Its past days stay in the history; upcoming ones are removed.');

    await sheetButton('Cancel');
    expect(sheetOpen(element)).toBe(false);
    // Focus goes back to the Delete button the user came from (BILLIAMVT-49)
    await new Promise((resolve) => setTimeout(resolve));
    expect(document.activeElement).toBe(element.querySelector('[data-delete="1"]'));

    await click('Dishes', 'Delete');
    await sheetButton('Delete');
    expect(service.delete).toHaveBeenCalledWith(1);
    expect([...element.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['Vacuum']);
  });

  it('offers Try again when the list failed to load (BILLIAMVT-53)', async () => {
    let calls = 0;
    const vacuum = task(1, 'Vacuum');
    const { element, fixture } = await render([vacuum], () =>
      ++calls === 1 ? throwError(() => new HttpErrorResponse({ status: 0 })) : of([vacuum]),
    );

    element.querySelector<HTMLButtonElement>('button.retry')!.click();
    await fixture.whenStable();

    expect(element.querySelector('.form-error')).toBeNull();
    expect(element.querySelector('.task .name')?.textContent).toBe('Vacuum');
  });

  it('invites adding a first task', async () => {
    const { element } = await render([]);
    expect(element.textContent).toContain('No tasks yet');
  });
});
