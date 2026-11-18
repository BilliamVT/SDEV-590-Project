import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, output, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';
import { BacklogService } from '../backlog/backlog.service';
import { Announcer } from '../shared/announcer';
import { ConfirmSheet } from '../shared/confirm-sheet';
import { focusLater } from '../shared/focus';
import { addDays, dayLabel, startOfWeek, toIsoDate, weekLabel } from './dates';
import { OccurrenceStatus, Schedule, ScheduledOccurrence } from './schedule.models';
import { ScheduleService } from './schedule.service';
import { changedMessage, isStale, removedMessage, wasAlready } from './stale';

interface Day {
  date: string;
  label: string;
  isToday: boolean;
  occurrences: ScheduledOccurrence[];
}

/** The household's week, Sunday to Saturday (BILLIAMVT-39). */
@Component({
  selector: 'app-week-view',
  imports: [ConfirmSheet],
  host: {
    // A ⋯ menu closes on a tap anywhere else, or Escape (BILLIAMVT-49)
    '(document:click)': 'closeMenuOutside($event)',
    '(document:keydown.escape)': 'closeMenu()',
    // Back in the app: the week may have changed on another phone (BILLIAMVT-55)
    '(document:visibilitychange)': 'refreshIfVisible()',
  },
  templateUrl: './week-view.html',
  styleUrl: './week-view.scss',
})
export class WeekView {
  private readonly schedules = inject(ScheduleService);
  private readonly backlog = inject(BacklogService);
  private readonly announcer = inject(Announcer);
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;

  /** A status changed or a day was deleted; a one-off item may be back in the backlog (BILLIAMVT-23). */
  readonly changed = output<void>();

  /**
   * The week with the household's today. The device's date is a first guess, corrected from the
   * server's today, which is in the household's time zone (BILLIAMVT-51).
   */
  private readonly thisWeek = signal(startOfWeek(toIsoDate(new Date())));
  protected readonly weekStart = signal(this.thisWeek());
  protected readonly weekEnd = computed(() => addDays(this.weekStart(), 6));
  protected readonly title = computed(() => weekLabel(this.weekStart(), this.weekEnd()));
  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** The user has no household yet; the household card asks them to set one up. */
  protected readonly noHousehold = signal(false);
  /** Occurrences whose status change is on its way to the server */
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  /** The day whose ⋯ menu (Skip, Delete or Remove) is open */
  protected readonly menuOpen = signal<number | null>(null);
  /** The day the delete action sheet is open for */
  protected readonly choosingDelete = signal<number | null>(null);
  /** The day the Move sheet is open for, and the day picked (BILLIAMVT-56) */
  protected readonly choosingMove = signal<number | null>(null);
  protected readonly moveDate = signal('');
  /**
   * Says that an action found its day already changed, and the week was reloaded (BILLIAMVT-55).
   * Shown as a status message, so screen readers read it too; cleared by the next action.
   */
  protected readonly notice = signal<string | null>(null);
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

  /** The day the delete action sheet is asking about */
  protected readonly pendingDelete = computed(
    () => this.schedule()?.occurrences.find((o) => o.id === this.choosingDelete()) ?? null,
  );

  protected readonly deleteMessage = computed(() => {
    const occurrence = this.pendingDelete();
    if (!occurrence) {
      return '';
    }
    return occurrence.oneOff
      ? `Delete ${occurrence.taskName} for good? This can't be undone.`
      : `Delete ${occurrence.taskName} on ${dayLabel(occurrence.date)}? Its other days stay.`;
  });

  protected readonly isThisWeek = computed(() => this.weekStart() === this.thisWeek());

  /** The day the move sheet is asking about */
  protected readonly pendingMove = computed(
    () => this.schedule()?.occurrences.find((o) => o.id === this.choosingMove()) ?? null,
  );

  protected readonly moveMessage = computed(() => {
    const occurrence = this.pendingMove();
    return occurrence ? `Move ${occurrence.taskName} from ${dayLabel(occurrence.date)} to:` : '';
  });

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
    this.go(this.thisWeek());
  }

  protected minutes(occurrence: ScheduledOccurrence): string | null {
    return occurrence.estimatedMinutes ? `${occurrence.estimatedMinutes} min` : null;
  }

  /** Done, Skip, or Undo (back to pending); the item updates from the server's reply (BILLIAMVT-25). */
  /** The circle: marks a pending day done, or undoes a done or skipped one. One button, so focus stays on it. */
  protected toggleDone(occurrence: ScheduledOccurrence): void {
    this.setStatus(occurrence, occurrence.status === 'PENDING' ? 'DONE' : 'PENDING');
  }

  protected setStatus(occurrence: ScheduledOccurrence, status: OccurrenceStatus): void {
    const id = occurrence.id;
    const fromMenu = this.menuOpen() === id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.notice.set(null);
    this.menuOpen.set(null);
    this.schedules.changeStatus(id, status).subscribe({
      next: (updated) => {
        this.saving.update((ids) => removeId(ids, id));
        if (wasAlready(updated, status, this.myId())) {
          // Someone else got there first; other days may have changed too
          this.refreshAfterStale(changedMessage(updated, this.myId()));
          return;
        }
        this.schedule.update((schedule) =>
          schedule && { ...schedule, occurrences: schedule.occurrences.map((o) => (o.id === id ? updated : o)) },
        );
        this.changed.emit();
        this.announcer.announce(`${occurrence.taskName} ${STATUS_WORDS[status]}`);
        if (fromMenu) {
          this.focusMore(id);
        }
      },
      error: (err: unknown) => this.failed(occurrence, err),
    });
  }

  /**
   * Asks first in an action sheet (BILLIAMVT-49; it used the browser's confirm before): only this day
   * of a recurring task, or a one-off item for good with all its days (BILLIAMVT-23).
   */
  protected delete(occurrence: ScheduledOccurrence): void {
    this.menuOpen.set(null);
    this.choosingDelete.set(occurrence.id);
  }

  /**
   * Move in the ⋯ menu (BILLIAMVT-56): the way to move a day without dragging (WCAG 2.2 SC 2.5.7).
   * Opens a sheet with a day picker, starting on the day it's on now.
   */
  protected startMove(occurrence: ScheduledOccurrence): void {
    this.menuOpen.set(null);
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, occurrence.id));
    this.moveDate.set(occurrence.date);
    this.choosingMove.set(occurrence.id);
  }

  /** Move in the sheet: the day leaves its row, and shows on its new day if that's in this week. */
  protected confirmMove(): void {
    const occurrence = this.pendingMove();
    if (!occurrence) {
      return;
    }
    const id = occurrence.id;
    const date = this.moveDate();
    if (!date) {
      this.itemErrors.update((errors) => new Map(errors).set(id, 'Choose a day.'));
      return;
    }
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.schedules.move(id, date).subscribe({
      next: (moved) => {
        const inWeek = moved.date >= this.weekStart() && moved.date <= this.weekEnd();
        this.schedule.update(
          (schedule) =>
            schedule && {
              ...schedule,
              occurrences: inWeek
                ? schedule.occurrences.map((o) => (o.id === id ? moved : o))
                : schedule.occurrences.filter((o) => o.id !== id),
            },
        );
        this.saving.update((ids) => removeId(ids, id));
        this.choosingMove.set(null);
        // A status message, so screen readers read it too
        this.notice.set(`${moved.taskName} moved to ${dayLabel(moved.date)}.`);
        if (inWeek) {
          this.focusMore(id);
        } else {
          focusLater(this.host, '#week-title');
        }
      },
      error: (err: unknown) => {
        if (isStale(err)) {
          this.choosingMove.set(null);
          this.failed(occurrence, err);
        } else {
          // e.g. a day in the past: the server's message shows in the sheet
          this.saving.update((ids) => removeId(ids, id));
          this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        }
      },
    });
  }

  /** The move sheet was cancelled: focus goes back to the row's ⋯ button. */
  protected cancelMove(): void {
    const id = this.choosingMove();
    this.choosingMove.set(null);
    if (id !== null) {
      this.itemErrors.update((errors) => removeError(errors, id));
      this.focusMore(id);
    }
  }

  /** Opens or closes a day's ⋯ menu; only one is open at a time. */
  protected toggleMenu(occurrence: ScheduledOccurrence): void {
    this.choosingDelete.set(null);
    this.choosingMove.set(null);
    this.menuOpen.update((open) => (open === occurrence.id ? null : occurrence.id));
  }

  /** Escape: closes the menu and puts focus back on its ⋯ button. */
  protected closeMenu(): void {
    const open = this.menuOpen();
    this.menuOpen.set(null);
    if (open !== null) {
      this.focusMore(open);
    }
  }

  /** A tap outside the open menu and its ⋯ button closes it. */
  protected closeMenuOutside(event: Event): void {
    const target = event.target as Element | null;
    if (this.menuOpen() !== null && !target?.closest('.menu, .more')) {
      this.menuOpen.set(null);
    }
  }

  /** Deletes only this day of a recurring task; its other days stay (BILLIAMVT-25). */
  protected deleteDay(occurrence: ScheduledOccurrence): void {
    this.remove(
      occurrence,
      this.schedules.delete(occurrence.id),
      (o) => o.id === occurrence.id,
      `${occurrence.taskName} on ${dayLabel(occurrence.date)} deleted`,
    );
  }

  /** Removes the day; the item shows in the backlog again. Easy to reverse, so it doesn't ask first. */
  protected backToBacklog(occurrence: ScheduledOccurrence): void {
    this.menuOpen.set(null);
    this.remove(
      occurrence,
      this.schedules.delete(occurrence.id),
      (o) => o.id === occurrence.id,
      `${occurrence.taskName} moved back to the backlog`,
    );
  }

  /** Deletes the item and all its days. */
  protected deleteItem(occurrence: ScheduledOccurrence): void {
    this.remove(
      occurrence,
      this.backlog.delete(occurrence.taskId),
      (o) => o.taskId === occurrence.taskId,
      `${occurrence.taskName} deleted`,
    );
  }

  /** Delete in the action sheet: only this day of a recurring task, or a one-off item for good. */
  protected confirmDelete(): void {
    const occurrence = this.pendingDelete();
    if (occurrence) {
      if (occurrence.oneOff) {
        this.deleteItem(occurrence);
      } else {
        this.deleteDay(occurrence);
      }
    }
  }

  /** The action sheet was cancelled: focus goes back to the row's ⋯ button. */
  protected cancelDelete(): void {
    const id = this.choosingDelete();
    this.choosingDelete.set(null);
    if (id !== null) {
      this.focusMore(id);
    }
  }

  /** Sends a delete, then takes the matching occurrences off the week. */
  private remove(
    occurrence: ScheduledOccurrence,
    request: Observable<void>,
    removed: (o: ScheduledOccurrence) => boolean,
    announcement: string,
  ): void {
    const id = occurrence.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.notice.set(null);
    request.subscribe({
      next: () => {
        this.schedule.update(
          (schedule) => schedule && { ...schedule, occurrences: schedule.occurrences.filter((o) => !removed(o)) },
        );
        this.saving.update((ids) => removeId(ids, id));
        this.choosingDelete.set(null);
        this.changed.emit();
        this.announcer.announce(announcement);
        // The row is gone: focus its day's heading, so keyboard users stay in place
        focusLater(this.host, `[data-date="${occurrence.date}"] h3`);
      },
      error: (err: unknown) => this.failed(occurrence, err),
    });
  }

  /**
   * An action failed. If its day had changed (409) or gone (404), reload the week and say what
   * happened (decision record 0007); otherwise show the error on the row, as before.
   */
  private failed(occurrence: ScheduledOccurrence, err: unknown): void {
    const id = occurrence.id;
    this.saving.update((ids) => removeId(ids, id));
    if (!isStale(err)) {
      this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
      return;
    }
    this.choosingDelete.set(null);
    if (err.status === 404) {
      this.refreshAfterStale(removedMessage(occurrence.taskName));
    } else {
      this.refreshAfterStale((schedule) => changedMessage(schedule.occurrences.find((o) => o.id === id), this.myId()));
    }
  }

  /** Reloads the week (and, through changed, the backlog), then shows the notice. */
  private refreshAfterStale(message: string | ((schedule: Schedule) => string)): void {
    this.changed.emit();
    this.load((schedule) => {
      this.notice.set(typeof message === 'string' ? message : message(schedule));
      focusLater(this.host, '#week-title');
    });
  }

  /** Coming back to the app reloads the week silently: a change appearing isn't an error. */
  protected refreshIfVisible(): void {
    if (document.visibilityState === 'visible' && !this.noHousehold()) {
      this.notice.set(null);
      this.load();
    }
  }

  private myId(): number | null {
    return this.auth.user()?.id ?? null;
  }

  /** Called after a backlog item is put on a day, or the household changes. */
  reload(): void {
    this.load();
  }

  private go(weekStart: string): void {
    this.notice.set(null);
    this.weekStart.set(weekStart);
    this.announcer.announce(`Showing ${this.title()}`);
    this.load();
  }

  private focusMore(id: number): void {
    focusLater(this.host, `[data-more="${id}"]`);
  }

  /** {@code after} runs once the week has loaded, e.g. to show a notice about what changed. */
  private load(after?: (schedule: Schedule) => void): void {
    this.loading.set(true);
    this.error.set(null);
    this.schedules.between(this.weekStart(), this.weekEnd()).subscribe({
      next: (schedule) => {
        const householdWeek = startOfWeek(schedule.today);
        if (householdWeek !== this.thisWeek()) {
          const showingThisWeek = this.weekStart() === this.thisWeek();
          this.thisWeek.set(householdWeek);
          if (showingThisWeek) {
            this.go(householdWeek);
            return;
          }
        }
        this.schedule.set(schedule);
        this.noHousehold.set(false);
        this.loading.set(false);
        after?.(schedule);
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

/** For announcing a change of status, e.g. "Vacuum marked done". */
const STATUS_WORDS: Record<OccurrenceStatus, string> = {
  DONE: 'marked done',
  SKIPPED: 'skipped',
  PENDING: 'marked not done',
};
