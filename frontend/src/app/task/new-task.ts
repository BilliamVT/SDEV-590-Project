import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { errorMessage } from '../auth/error-message';
import { HouseholdService } from '../household/household.service';
import { CreateTaskRequest, DayOfWeek, Frequency } from './task.models';
import { TaskService } from './task.service';

/** Sunday first, like the week view; the index matches JavaScript's getDay(). */
const DAYS: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** Same limits as the backend's RecurrenceRules. */
const INTERVAL_LIMITS: Partial<Record<Frequency, { max: number; unit: string }>> = {
  EVERY_N_DAYS: { max: 90, unit: 'days' },
  EVERY_N_WEEKS: { max: 52, unit: 'weeks' },
};

/**
 * The New task form, and the Edit task form at /tasks/:id/edit (BILLIAMVT-22). The fixed menu of
 * schedules (decision record 0003); users never type rule text.
 */
@Component({
  selector: 'app-new-task',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './new-task.html',
  styleUrl: './new-task.scss',
})
export class NewTask {
  private readonly tasks = inject(TaskService);
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);
  /** Set when editing an existing task. */
  protected readonly taskId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;
  /** An edited task's current start date, which may already be in the past. */
  private readonly originalStart = signal<string | null>(null);

  protected readonly frequencies: { value: Frequency; label: string }[] = [
    { value: 'DAILY', label: 'Every day' },
    { value: 'WEEKLY', label: 'Every week' },
    { value: 'EVERY_N_DAYS', label: 'Every few days' },
    { value: 'EVERY_N_WEEKS', label: 'Every few weeks' },
    { value: 'MONTHLY', label: 'Every month' },
    { value: 'QUARTERLY', label: 'Every 3 months' },
  ];
  /** The day toggles: S M T W T F S, with each day's full name for screen readers */
  protected readonly days = DAYS.map((value) => ({ value, letter: value.charAt(0), name: value.charAt(0) + value.slice(1).toLowerCase() }));
  protected readonly daysOfMonth = [...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })), { value: -1, label: 'Last day' }];

  protected readonly form = inject(FormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    frequency: ['WEEKLY' as Frequency, Validators.required],
    interval: [2 as number | null],
    // None chosen at first: a preselected day would be easy to keep by accident when tapping another
    daysOfWeek: [[] as DayOfWeek[]],
    dayOfMonth: [1],
    startsOn: [this.households.today()],
    estimatedMinutes: [null as number | null, [Validators.min(1), Validators.max(1440)]],
  });
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(this.taskId !== null);

  constructor() {
    // Reached straight from a link or a reload, the household's time zone may not be known yet
    if (!this.households.timeZoneKnown()) {
      this.households.load().subscribe({
        next: () => {
          const start = this.form.controls.startsOn;
          if (this.taskId === null && start.pristine) {
            start.setValue(this.today());
          }
        },
        // The browser's today stays as the guess; the server still checks the date
        error: () => undefined,
      });
    }
    if (this.taskId !== null) {
      this.tasks.get(this.taskId).subscribe({
        next: (task) => {
          this.form.patchValue({
            name: task.name,
            frequency: task.frequency,
            interval: task.interval ?? 2,
            daysOfWeek: task.daysOfWeek ?? [],
            dayOfMonth: task.dayOfMonth ?? 1,
            startsOn: task.startsOn,
            estimatedMinutes: task.estimatedMinutes,
          });
          this.originalStart.set(task.startsOn);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(errorMessage(err));
          this.loading.set(false);
        },
      });
    }
  }

  /** The household's today (BILLIAMVT-51): a start date can't be earlier than it. */
  protected today(): string {
    return this.households.today();
  }

  /** The date picker's minimum: today, or an edited task's existing start if that's earlier. */
  protected minStart(): string {
    const original = this.originalStart();
    return original && original < this.today() ? original : this.today();
  }

  /** "Every week on Saturday" → "every week on Saturday", to follow "Saved: Vacuum," */
  protected lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  protected frequency(): Frequency {
    return this.form.controls.frequency.value ?? 'WEEKLY';
  }

  protected needsDay(): boolean {
    return this.frequency() === 'WEEKLY' || this.frequency() === 'EVERY_N_WEEKS';
  }

  protected isChosen(day: DayOfWeek): boolean {
    return this.form.controls.daysOfWeek.value!.includes(day);
  }

  /** Adds or removes a day, keeping them Sunday first. */
  protected toggleDay(day: DayOfWeek): void {
    const chosen = this.isChosen(day) ? this.form.controls.daysOfWeek.value!.filter((d) => d !== day) : [...this.form.controls.daysOfWeek.value!, day];
    this.form.controls.daysOfWeek.setValue(DAYS.filter((d) => chosen.includes(d)));
  }

  protected daysInvalid(): boolean {
    return this.needsDay() && this.form.controls.daysOfWeek.value!.length === 0;
  }

  protected intervalLimit() {
    return INTERVAL_LIMITS[this.frequency()];
  }

  protected needsStartDate(): boolean {
    return this.intervalLimit() !== undefined || this.frequency() === 'QUARTERLY';
  }

  /**
   * When a task with a chosen start date first happens, matching the backend: every-N-weeks
   * tasks start on the earliest chosen weekday on or after the date, and quarterly tasks after the
   * 28th use the last day of the month. Null until the inputs are valid.
   */
  protected preview(): string | null {
    const value = this.form.getRawValue();
    // An edited task's unchanged start can be in the past; "first time" would be misleading then
    if (!this.needsStartDate() || this.startInvalid() || this.intervalInvalid() || this.daysInvalid() || value.startsOn! < this.today()) {
      return null;
    }
    const [year, month, day] = value.startsOn!.split('-').map(Number);
    let first = new Date(year, month - 1, day);
    let then: string;
    switch (this.frequency()) {
      case 'EVERY_N_WEEKS': {
        const daysUntil = Math.min(...value.daysOfWeek!.map((d) => (DAYS.indexOf(d) - first.getDay() + 7) % 7));
        first = new Date(year, month - 1, day + daysUntil);
        then = `every ${value.interval} weeks`;
        break;
      }
      case 'QUARTERLY':
        if (day > 28) {
          first = new Date(year, month, 0);
          then = 'every 3 months on the last day';
        } else {
          then = 'every 3 months';
        }
        break;
      default:
        then = `every ${value.interval} days`;
    }
    const date = first.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    return `First time: ${date}, then ${then}.`;
  }

  protected startInvalid(): boolean {
    const startsOn = this.form.controls.startsOn.value;
    // yyyy-mm-dd strings compare in date order; an edited task may keep its existing start
    return this.needsStartDate() && (!startsOn || (startsOn < this.today() && startsOn !== this.originalStart()));
  }

  protected intervalInvalid(): boolean {
    const limit = this.intervalLimit();
    const interval = this.form.controls.interval.value;
    return limit !== undefined && (interval === null || !Number.isInteger(interval) || interval < 2 || interval > limit.max);
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.form.invalid || this.intervalInvalid() || this.startInvalid() || this.daysInvalid()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const save = this.taskId === null ? this.tasks.create(this.request()) : this.tasks.update(this.taskId, this.request());
    save.subscribe({
      // A new task goes back to the week view, an edited one to the task list; both show a "Saved" notice
      next: (task) =>
        void this.router.navigate([this.taskId === null ? '/' : '/tasks'], {
          state: { savedTask: { name: task.name, schedule: this.lowerFirst(task.schedule) } },
        }),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }

  /** Only the fields this frequency uses. */
  private request(): CreateTaskRequest {
    const value = this.form.getRawValue();
    const request: CreateTaskRequest = { name: value.name!.trim(), frequency: this.frequency() };
    if (this.intervalLimit()) request.interval = value.interval!;
    if (this.needsDay()) request.daysOfWeek = value.daysOfWeek!;
    if (this.frequency() === 'MONTHLY') request.dayOfMonth = Number(value.dayOfMonth);
    if (this.needsStartDate()) request.startsOn = value.startsOn!;
    if (value.estimatedMinutes) request.estimatedMinutes = value.estimatedMinutes;
    return request;
  }
}
