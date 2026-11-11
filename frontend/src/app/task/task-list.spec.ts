import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

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
  dayOfWeek: null,
  dayOfMonth: null,
  startsOn: '2026-11-11',
  estimatedMinutes: null,
  active: true,
  ...extra,
});

describe('TaskList', () => {
  async function render(tasks: Task[]) {
    const service = {
      list: vi.fn(() => of(tasks)),
      pause: vi.fn((id: number) => of({ ...tasks.find((t) => t.id === id)!, active: false })),
      resume: vi.fn((id: number) => of({ ...tasks.find((t) => t.id === id)!, active: true })),
      delete: vi.fn(() => of(undefined)),
    };
    await TestBed.configureTestingModule({
      imports: [TaskList],
      providers: [provideRouter([]), { provide: TaskService, useValue: service }],
    }).compileComponents();
    const fixture = TestBed.createComponent(TaskList);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const row = (name: string) => [...element.querySelectorAll('.task')].find((r) => r.querySelector('.name')?.textContent === name)!;
    const click = async (name: string, label: string) => {
      [...row(name).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    };
    return { service, element, row, click };
  }

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

  it('asks before deleting', async () => {
    const { service, element, row, click } = await render([task(1, 'Dishes'), task(2, 'Vacuum')]);

    await click('Dishes', 'Delete…');
    expect(service.delete).not.toHaveBeenCalled();
    expect(row('Dishes').textContent).toContain('Past occurrences stay in its history');

    await click('Dishes', 'Cancel');
    expect(row('Dishes').querySelector('.warning')).toBeNull();

    await click('Dishes', 'Delete…');
    await click('Dishes', 'Delete');
    expect(service.delete).toHaveBeenCalledWith(1);
    expect([...element.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['Vacuum']);
  });

  it('invites adding a first task', async () => {
    const { element } = await render([]);
    expect(element.textContent).toContain('No tasks yet');
  });
});
