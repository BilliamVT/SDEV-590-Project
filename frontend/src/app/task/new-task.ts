import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { errorMessage } from '../auth/error-message';
import { CreateTaskRequest, DayOfWeek, Frequency, Task } from './task.models';
import { TaskService } from './task.service';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

/** Same limits as the backend's RecurrenceRules. */
const INTERVAL_LIMITS: Partial<Record<Frequency, { max: number; unit: string }>> = {
  EVERY_N_DAYS: { max: 90, unit: 'days' },
  EVERY_N_WEEKS: { max: 52, unit: 'weeks' },
};

/** The fixed menu of schedules (decision record 0003); users never type rule text. */
@Component({
  selector: 'app-new-task',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './new-task.html',
  styleUrl: './new-task.scss',
})
export class NewTask {
  private readonly tasks = inject(TaskService);

  protected readonly frequencies: { value: Frequency; label: string }[] = [
    { value: 'DAILY', label: 'Every day' },
    { value: 'WEEKLY', label: 'Every week' },
    { value: 'EVERY_N_DAYS', label: 'Every few days' },
    { value: 'EVERY_N_WEEKS', label: 'Every few weeks' },
    { value: 'MONTHLY', label: 'Every month' },
    { value: 'QUARTERLY', label: 'Every 3 months' },
  ];
  protected readonly days = DAYS.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }));
  protected readonly daysOfMonth = [...Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1}` })), { value: -1, label: 'Last day' }];

  protected readonly form = inject(FormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    frequency: ['WEEKLY' as Frequency, Validators.required],
    interval: [2 as number | null],
    // Today's weekday: JavaScript counts Sunday as 0
    dayOfWeek: [DAYS[(new Date().getDay() + 6) % 7]],
    dayOfMonth: [1],
    startsOn: [today()],
    estimatedMinutes: [null as number | null, [Validators.min(1), Validators.max(1440)]],
  });
  protected readonly attempted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal<Task | null>(null);

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

  protected intervalLimit() {
    return INTERVAL_LIMITS[this.frequency()];
  }

  protected needsStartDate(): boolean {
    return this.intervalLimit() !== undefined || this.frequency() === 'QUARTERLY';
  }

  protected intervalInvalid(): boolean {
    const limit = this.intervalLimit();
    const interval = this.form.controls.interval.value;
    return limit !== undefined && (interval === null || !Number.isInteger(interval) || interval < 2 || interval > limit.max);
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.form.invalid || this.intervalInvalid() || (this.needsStartDate() && !this.form.controls.startsOn.value)) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.tasks.create(this.request()).subscribe({
      next: (task) => {
        this.saved.set(task);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }

  protected addAnother(): void {
    this.saved.set(null);
    this.attempted.set(false);
    this.form.controls.name.reset('');
    this.form.controls.estimatedMinutes.reset(null);
  }

  /** Only the fields this frequency uses. */
  private request(): CreateTaskRequest {
    const value = this.form.getRawValue();
    const request: CreateTaskRequest = { name: value.name!.trim(), frequency: this.frequency() };
    if (this.intervalLimit()) request.interval = value.interval!;
    if (this.needsDay()) request.dayOfWeek = value.dayOfWeek!;
    if (this.frequency() === 'MONTHLY') request.dayOfMonth = Number(value.dayOfMonth);
    if (this.needsStartDate()) request.startsOn = value.startsOn!;
    if (value.estimatedMinutes) request.estimatedMinutes = value.estimatedMinutes;
    return request;
  }
}

/** Today in the browser's time zone, as yyyy-mm-dd. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
