import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { errorMessage } from '../auth/error-message';
import { addDays, dayLabel, startOfWeek, toIsoDate, weekLabel } from './dates';
import { OccurrenceStatus, Schedule, ScheduledOccurrence } from './schedule.models';
import { ScheduleService } from './schedule.service';

interface Day {
  date: string;
  label: string;
  isToday: boolean;
  occurrences: ScheduledOccurrence[];
}

/** The household's week, Sunday to Saturday (BILLIAMVT-39). */
@Component({
  selector: 'app-week-view',
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
})
export class WeekView {
  private readonly schedules = inject(ScheduleService);

  private readonly thisWeek = startOfWeek(toIsoDate(new Date()));
  protected readonly weekStart = signal(this.thisWeek);
  protected readonly weekEnd = computed(() => addDays(this.weekStart(), 6));
  protected readonly title = computed(() => weekLabel(this.weekStart(), this.weekEnd()));
  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** The user has no household yet; the household card asks them to set one up. */
  protected readonly noHousehold = signal(false);
  /** Occurrences whose status change is on its way to the server */
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  /** A failed status change, shown on that occurrence */
  protected readonly itemErrors = signal<ReadonlyMap<number, string>>(new Map());

  protected readonly days = computed<Day[]>(() => {
    const schedule = this.schedule();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(this.weekStart(), i);
      return {
        date,
        label: dayLabel(date),
        isToday: date === schedule?.today,
        occurrences: schedule?.occurrences.filter((o) => o.date === date) ?? [],
      };
    });
  });

  /** The API can't show past lastViewableDate, so stop at the week that contains it. */
  protected readonly atLimit = computed(() => {
    const last = this.schedule()?.lastViewableDate;
    return last !== undefined && addDays(this.weekEnd(), 7) > last;
  });

  protected readonly isThisWeek = computed(() => this.weekStart() === this.thisWeek);

  constructor() {
    this.load();
  }

  protected previous(): void {
    this.go(addDays(this.weekStart(), -7));
  }

  protected next(): void {
    if (!this.atLimit()) {
      this.go(addDays(this.weekStart(), 7));
    }
  }

  protected today(): void {
    this.go(this.thisWeek);
  }

  protected minutes(occurrence: ScheduledOccurrence): string | null {
    return occurrence.estimatedMinutes ? `${occurrence.estimatedMinutes} min` : null;
  }

  /** Done, Skip, or Undo (back to pending); the item updates from the server's reply (BILLIAMVT-25). */
  protected setStatus(occurrence: ScheduledOccurrence, status: OccurrenceStatus): void {
    const id = occurrence.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.schedules.changeStatus(id, status).subscribe({
      next: (updated) => {
        this.schedule.update((schedule) =>
          schedule && { ...schedule, occurrences: schedule.occurrences.map((o) => (o.id === id ? updated : o)) },
        );
        this.saving.update((ids) => removeId(ids, id));
      },
      error: (err: unknown) => {
        this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        this.saving.update((ids) => removeId(ids, id));
      },
    });
  }

  /** Deletes this one day for good, after the browser's confirmation (wording to refine in BILLIAMVT-49). */
  protected delete(occurrence: ScheduledOccurrence): void {
    const question = `Delete "${occurrence.taskName}" on ${dayLabel(occurrence.date)} for good? This only removes this day, and it can't be undone.`;
    if (!confirm(question)) {
      return;
    }
    const id = occurrence.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.schedules.delete(id).subscribe({
      next: () => {
        this.schedule.update(
          (schedule) => schedule && { ...schedule, occurrences: schedule.occurrences.filter((o) => o.id !== id) },
        );
        this.saving.update((ids) => removeId(ids, id));
      },
      error: (err: unknown) => {
        this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        this.saving.update((ids) => removeId(ids, id));
      },
    });
  }

  private go(weekStart: string): void {
    this.weekStart.set(weekStart);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.schedules.between(this.weekStart(), this.weekEnd()).subscribe({
      next: (schedule) => {
        this.schedule.set(schedule);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.noHousehold.set(err instanceof HttpErrorResponse && err.status === 404);
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }
}

function removeId(ids: ReadonlySet<number>, id: number): Set<number> {
  const copy = new Set(ids);
  copy.delete(id);
  return copy;
}

function removeError(errors: ReadonlyMap<number, string>, id: number): Map<number, string> {
  const copy = new Map(errors);
  copy.delete(id);
  return copy;
}
