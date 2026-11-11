import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { CreateTaskRequest, Task } from './task.models';
import { NewTask } from './new-task';
import { TaskService } from './task.service';

/** The task form in edit mode, at /tasks/:id/edit (BILLIAMVT-22). */
describe('NewTask (editing)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 12)); // Wednesday Nov 11, 2026
  });
  afterEach(() => vi.useRealTimers());

  const existing: Task = {
    id: 7,
    name: 'Water plants',
    recurrenceRule: 'FREQ=DAILY;INTERVAL=3',
    schedule: 'Every 3 days',
    frequency: 'EVERY_N_DAYS',
    interval: 3,
    dayOfWeek: null,
    dayOfMonth: null,
    // Started before today: still allowed as long as it isn't changed
    startsOn: '2026-11-02',
    estimatedMinutes: 5,
    active: true,
  };

  async function render() {
    const tasks = {
      get: vi.fn(() => of(existing)),
      update: vi.fn((_id: number, request: CreateTaskRequest) => of({ ...existing, ...request, schedule: 'Every 4 days' })),
    };
    await TestBed.configureTestingModule({
      imports: [NewTask],
      providers: [
        provideRouter([]),
        { provide: TaskService, useValue: tasks },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(NewTask);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const value = (id: string) => element.querySelector<HTMLInputElement>(`#${id}`)!.value;
    const set = async (id: string, text: string) => {
      const field = element.querySelector<HTMLInputElement>(`#${id}`)!;
      field.value = text;
      field.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { tasks, router, element, value, set, submit };
  }

  it('fills in the form with the task', async () => {
    const { tasks, element, value } = await render();

    expect(tasks.get).toHaveBeenCalledWith(7);
    expect(element.querySelector('h2')?.textContent).toBe('Edit task');
    expect(value('task-name')).toBe('Water plants');
    expect(value('task-frequency')).toBe('EVERY_N_DAYS');
    expect(value('task-interval')).toBe('3');
    expect(value('task-start')).toBe('2026-11-02');
    expect(value('task-minutes')).toBe('5');
  });

  it("keeps a start date that's already in the past, and allows picking it", async () => {
    const { tasks, router, element, set, submit } = await render();
    expect(element.querySelector<HTMLInputElement>('#task-start')?.min).toBe('2026-11-02');
    expect(element.querySelector('.preview')).toBeNull();

    await set('task-interval', '4');
    await submit();

    expect(tasks.update).toHaveBeenCalledWith(7, {
      name: 'Water plants',
      frequency: 'EVERY_N_DAYS',
      interval: 4,
      startsOn: '2026-11-02',
      estimatedMinutes: 5,
    });
    expect(router.navigate).toHaveBeenCalledWith(['/tasks'], {
      state: { savedTask: { name: 'Water plants', schedule: 'every 4 days' } },
    });
  });

  it("doesn't allow moving the start to another past date", async () => {
    const { tasks, element, set, submit } = await render();
    await set('task-start', '2026-11-05');
    await submit();

    expect(tasks.update).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Choose a start date from today on.');
  });
});
