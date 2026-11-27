import { Component, ElementRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { errorMessage } from '../auth/error-message';
import { BacklogService } from '../backlog/backlog.service';
import { HouseholdService } from '../household/household.service';
import { dayLabel } from '../schedule/dates';
import { focusFirstInvalid } from '../shared/focus';
import { Toast } from '../shared/toast';
import { TASK_COLORS, TaskColor, colorLabel } from './task-colors';
import { CreateTaskRequest, DayOfWeek, Frequency } from './task.models';
import { TaskService } from './task.service';

/** Sunday first, like the week view; the index matches JavaScript's getDay(). */
const DAYS: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * The Repeats menu: a schedule, or Never for a one-time task on a day (BILLIAMVT-59). A one-time
 * task is a one-off item put straight on that day, not a task with a schedule.
 */
type Repeats = Frequency | 'ONCE';

/** Same limits as the backend's RecurrenceRules. 12 months is Every year (BILLIAMVT-60). */
const INTERVAL_LIMITS: Partial<Record<Frequency, { max: number; unit: string }>> = {
  EVERY_N_DAYS: { max: 90, unit: 'days' },
  EVERY_N_WEEKS: { max: 52, unit: 'weeks' },
  EVERY_N_MONTHS: { max: 11, unit: 'months' },
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
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly tasks = inject(TaskService);
  private readonly backlog = inject(BacklogService);
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  /** Set when editing an existing task. */
  protected readonly taskId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;
  /** An edited task's current start date, which may already be in the past. */
  private readonly originalStart = signal<string | null>(null);

  protected readonly frequencies: { value: Repeats; label: string }[] = [
    { value: 'DAILY', label: 'Every day' },
    { value: 'WEEKLY', label: 'Every week' },
    { value: 'EVERY_N_DAYS', label: 'Every few days' },
    { value: 'EVERY_N_WEEKS', label: 'Every few weeks' },
    { value: 'MONTHLY', label: 'Every month' },
    // Every few months replaces Every 3 months; Every year is its own option (BILLIAMVT-60)
    { value: 'EVERY_N_MONTHS', label: 'Every few months' },
    { value: 'YEARLY', label: 'Every year' },
    // Only when adding: an existing task keeps a schedule (BILLIAMVT-59)
    ...(this.taskId === null ? [{ value: 'ONCE' as Repeats, label: 'Never (one time)' }] : []),
  ];
  /** The day toggles: S M T W T F S, with each day's full name for screen readers */
  protected readonly days = DAYS.map((value) => ({ value, letter: value.charAt(0), name: value.charAt(0) + value.slice(1).toLowerCase() }));
  protected readonly daysOfMonth = [...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })), { value: -1, label: 'Last day' }];

  protected readonly form = inject(FormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    frequency: ['WEEKLY' as Repeats, Validators.required],
    interval: [2 as number | null],
    // None chosen at first: a preselected day would be easy to keep by accident when tapping another
    daysOfWeek: [[] as DayOfWeek[]],
    dayOfMonth: [1],
    startsOn: [this.households.today()],
    estimatedMinutes: [null as number | null, [Validators.min(1), Validators.max(1440)]],
    // Anyone (null) or a household member (BILLIAMVT-64)
    assigneeId: [null as number | null],
    // None (null) or one of the palette's colors (BILLIAMVT-65)
    color: [null as TaskColor | null],
  });
  protected readonly colors = TASK_COLORS;
  /** "Teal", or "No color", under the swatches */
  protected readonly colorName = toSignal(
    this.form.controls.color.valueChanges.pipe(map((color) => (color ? colorLabel(color) : 'No color'))),
    { initialValue: 'No color' },
  );
  /** Who the task can be assigned to: the household's members */
  protected readonly members = this.households.members;
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(this.taskId !== null);

  constructor() {
    // Reached straight from a link or a reload, the household's time zone and members may not be known yet
    if (!this.households.timeZoneKnown() || this.households.members() === null) {
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
            assigneeId: task.assigneeId,
            color: task.color,
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

  protected frequency(): Repeats {
    return this.form.controls.frequency.value ?? 'WEEKLY';
  }

  /** Never: a one-time task on the chosen day (BILLIAMVT-59). */
  protected once(): boolean {
    return this.frequency() === 'ONCE';
  }

  /** A one-time task's latest day: 2 years ahead, as for scheduling a backlog item. */
  protected maxOnce(): string {
    const [year, rest] = [this.today().slice(0, 4), this.today().slice(4)];
    return `${Number(year) + 2}${rest}`;
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
    return this.once() ? undefined : INTERVAL_LIMITS[this.frequency() as Frequency];
  }

  /** A start date, or for a one-time task its day. */
  protected needsStartDate(): boolean {
    return this.intervalLimit() !== undefined || this.frequency() === 'QUARTERLY' || this.frequency() === 'YEARLY' || this.once();
  }

  /**
   * When a task with a chosen start date first happens, matching the backend: every-N-weeks
   * tasks start on the earliest chosen weekday on or after the date, and quarterly tasks after the
   * 28th use the last day of the month. Null until the inputs are valid.
   */
  protected preview(): string | null {
    const value = this.form.getRawValue();
    // An edited task's unchanged start can be in the past; "first time" would be misleading then
    if (this.once() || !this.needsStartDate() || this.startInvalid() || this.intervalInvalid() || this.daysInvalid() || value.startsOn! < this.today()) {
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
      case 'EVERY_N_MONTHS': {
        // After the 28th it's the last day of each month, so February isn't skipped
        const months = this.frequency() === 'QUARTERLY' ? 3 : value.interval;
        if (day > 28) {
          first = new Date(year, month, 0);
          then = `every ${months} months on the last day`;
        } else {
          then = `every ${months} months`;
        }
        break;
      }
      case 'YEARLY':
        // Feb 29 repeats on the last day of February, so no year is skipped
        then = month === 2 && day === 29 ? 'every year on the last day of February' : 'every year';
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
      focusFirstInvalid(this.host);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    if (this.once()) {
      this.saveOnce();
      return;
    }
    const save = this.taskId === null ? this.tasks.create(this.request()) : this.tasks.update(this.taskId, this.request());
    save.subscribe({
      // A new task goes back to the week view, an edited one to the task list. "Saved" is a toast that
      // goes away on its own (BILLIAMVT-57); after adding, it offers to add another.
      next: (task) => {
        const added = this.taskId === null;
        this.toast.show(
          `Saved: ${task.name}, ${this.lowerFirst(task.schedule)}.`,
          added ? { label: 'Add another', run: () => void this.router.navigate(['/tasks/new']) } : undefined,
        );
        void this.router.navigate([added ? '/' : '/tasks']);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }

  /**
   * A one-time task goes straight onto its day in one request (BILLIAMVT-59): a one-off item with a
   * date, so it behaves like a backlog item put on a day.
   */
  private saveOnce(): void {
    const value = this.form.getRawValue();
    const date = value.startsOn!;
    this.backlog
      .create({
        name: value.name!.trim(),
        date,
        ...(value.estimatedMinutes ? { estimatedMinutes: value.estimatedMinutes } : {}),
        ...(value.assigneeId !== null ? { assigneeId: value.assigneeId } : {}),
        ...(value.color !== null ? { color: value.color } : {}),
      })
      .subscribe({
        next: (item) => {
          this.toast.show(`Saved: ${item.name}, ${dayLabel(date)}.`, {
            label: 'Add another',
            run: () => void this.router.navigate(['/tasks/new']),
          });
          void this.router.navigate(['/']);
        },
        error: (err: unknown) => {
          this.error.set(errorMessage(err));
          this.saving.set(false);
        },
      });
  }

  /** Only the fields this frequency uses. */
  private request(): CreateTaskRequest {
    const value = this.form.getRawValue();
    const request: CreateTaskRequest = { name: value.name!.trim(), frequency: this.frequency() as Frequency };
    if (this.intervalLimit()) request.interval = value.interval!;
    if (this.needsDay()) request.daysOfWeek = value.daysOfWeek!;
    if (this.frequency() === 'MONTHLY') request.dayOfMonth = Number(value.dayOfMonth);
    if (this.needsStartDate()) request.startsOn = value.startsOn!;
    if (value.estimatedMinutes) request.estimatedMinutes = value.estimatedMinutes;
    // Always sent on an edit, where null takes the task back to Anyone; left out for Anyone when adding
    if (this.taskId !== null || value.assigneeId !== null) request.assigneeId = value.assigneeId;
    // The same for the color: an edit with none clears it
    if (this.taskId !== null || value.color !== null) request.color = value.color;
    return request;
  }
}
