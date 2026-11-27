import { CdkDrag, CdkDragDrop, CdkDragMove, CdkDragStart, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, computed, inject, output, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';
import { BacklogService } from '../backlog/backlog.service';
import { FeatureFlagsService } from '../feature/feature-flags.service';
import { firstName } from '../household/household.models';
import { HouseholdService } from '../household/household.service';
import { Announcer } from '../shared/announcer';
import { Toast, ToastAction } from '../shared/toast';
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
  /** The day's rows, after the Everyone / Mine filter */
  occurrences: ScheduledOccurrence[];
  /** Rows the Mine filter hides, so an empty day can say "Nothing for you" instead of "Nothing scheduled" */
  hidden: number;
}

/** Everyone, or only my days (BILLIAMVT-66) */
export type WeekFilter = 'everyone' | 'mine';

/** How long a week can take to load before the days dim, so quick changes don't flicker */
const DIM_AFTER_MS = 300;

/** Where this phone remembers the filter; per device, like a preference */
const FILTER_KEY = 'housework.weekFilter';

/** The household's week, Sunday to Saturday (BILLIAMVT-39). */
@Component({
  selector: 'app-week-view',
  imports: [CdkDrag, CdkDropList, CdkDropListGroup, ConfirmSheet],
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
  private readonly flags = inject(FeatureFlagsService);
  private readonly toast = inject(Toast);
  private readonly households = inject(HouseholdService);
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
  /** The days are dimmed while a week loads, but only once it has taken a moment (BILLIAMVT-58) */
  protected readonly dimmed = signal(false);
  private dimTimer?: ReturnType<typeof setTimeout>;
  private loadRequest?: Subscription;
  protected readonly error = signal<string | null>(null);
  /** The user has no household yet; the household card asks them to set one up. */
  protected readonly noHousehold = signal(false);
  /** Occurrences whose status change is on its way to the server */
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  /** The day whose ⋯ menu (Skip, Delete or Remove) is open */
  protected readonly menuOpen = signal<number | null>(null);
  /** The day the delete action sheet is open for */
  protected readonly choosingDelete = signal<number | null>(null);
  /**
   * Drag-and-drop between days (BILLIAMVT-28), behind the drag-drop flag. On a phone a row is picked
   * up by pressing and holding it, so a quick tap still works and a swipe still scrolls.
   */
  protected readonly dragEnabled = computed(() => this.flags.dragDrop());
  protected readonly dragStartDelay = { touch: 200, mouse: 0 };
  /**
   * How fast the page scrolls when a dragged row is held near the top or bottom edge: 10 px a frame
   * (about 600 px a second). The CDK's default of 2 felt very slow on a phone.
   */
  protected readonly autoScrollStep = 10;
  /**
   * The day a row is being dragged from, or null. While dragging, past days dim, and the other days
   * don't make room for the row: the page stays still and the outline shows where it will land.
   */
  protected readonly dragFrom = signal<string | null>(null);
  protected readonly dragging = computed(() => this.dragFrom() !== null);
  /**
   * The day under the finger while dragging, if it accepts drops: only it gets the dashed outline,
   * so no outline means letting go cancels (the CDK would otherwise keep the last day passed over).
   */
  protected readonly dropOver = signal<string | null>(null);
  /** The height of the day it's dragged from, held while dragging so the days below don't move up */
  protected readonly dragFromHeight = signal<number | null>(null);
  /** Only today and later accept a drop; the API refuses past days. */
  protected readonly acceptsDrop = (_drag: CdkDrag, drop: CdkDropList<string>) =>
    drop.data >= (this.schedule()?.today ?? '');
  /** The day the Move sheet is open for, and the day picked (BILLIAMVT-56) */
  protected readonly choosingMove = signal<number | null>(null);
  protected readonly moveDate = signal('');
  /** The day the Assign sheet is open for, and who's picked: a member's id, or null for Anyone (BILLIAMVT-64) */
  protected readonly choosingAssign = signal<number | null>(null);
  protected readonly assignChoice = signal<number | null>(null);
  /** Who a day can be assigned to */
  protected readonly members = this.households.members;
  protected readonly firstName = firstName;
  /**
   * Says that an action found its day already changed, and the week was reloaded (BILLIAMVT-55).
   * Shown as a status message, so screen readers read it too; cleared by the next action.
   */
  protected readonly notice = signal<string | null>(null);
  /** A failed status change, shown on that occurrence */
  protected readonly itemErrors = signal<ReadonlyMap<number, string>>(new Map());

  protected readonly days = computed<Day[]>(() => {
    const schedule = this.schedule();
    const mineOnly = this.showMineFilter() && this.filter() === 'mine';
    const me = this.myId();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(this.weekStart(), i);
      const all = schedule?.occurrences.filter((o) => o.date === date) ?? [];
      const occurrences = mineOnly ? all.filter((o) => isMine(o, me)) : all;
      return { date, label: dayLabel(date), isToday: date === schedule?.today, occurrences, hidden: all.length - occurrences.length };
    });
  });

  /**
   * Everyone / Mine (BILLIAMVT-66), remembered on this phone. Shown only when the household has
   * someone else in it: on your own, every day is yours.
   */
  protected readonly filter = signal<WeekFilter>(readFilter());
  protected readonly showMineFilter = computed(() => (this.members()?.length ?? 0) > 1);

  protected setFilter(filter: WeekFilter): void {
    this.filter.set(filter);
    this.menuOpen.set(null);
    try {
      localStorage.setItem(FILTER_KEY, filter);
    } catch {
      // Storage can be unavailable (private browsing); the filter still works until the page reloads
    }
  }

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

  /** The day the assign sheet is asking about */
  protected readonly pendingAssign = computed(
    () => this.schedule()?.occurrences.find((o) => o.id === this.choosingAssign()) ?? null,
  );

  protected readonly assignMessage = computed(() => {
    const occurrence = this.pendingAssign();
    return occurrence ? `Who's doing ${occurrence.taskName} on ${dayLabel(occurrence.date)}?` : '';
  });

  constructor() {
    this.load();
    // The members to choose from when assigning a day (BILLIAMVT-64)
    if (this.households.members() === null) {
      this.households.load().subscribe({ error: () => undefined });
    }
    this.stopScrollingWhileDragging();
  }

  /**
   * iPhone Safari decides at the start of a touch whether it may scroll, and only listens to "don't
   * scroll" from listeners that were there before the finger came down. The CDK adds its own when
   * the touch starts, so a lifted row could fight a page that was scrolling too. These listeners are
   * there from the start (BILLIAMVT-28).
   *
   * Scrolling is cancelled from the moment a hold on a draggable row is complete, not just once the
   * drag starts: the CDK only starts it after the finger moves 5 px, and if those first pixels were
   * let through, Safari would start scrolling and could no longer be stopped, leaving the row stuck.
   * A swipe that starts moving before the hold is up still scrolls as usual.
   */
  private stopScrollingWhileDragging(): void {
    let held = false;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      clearTimeout(holdTimer);
      held = false;
    };
    const onTouchStart = (event: TouchEvent) => {
      release();
      const row = (event.target as Element | null)?.closest?.('.occurrence.draggable');
      if (row && event.touches.length === 1) {
        holdTimer = setTimeout(() => (held = true), this.dragStartDelay.touch);
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!held && !this.dragging()) {
        // Moving before the hold is up is a scroll: the CDK won't start a drag
        clearTimeout(holdTimer);
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', release, { passive: true });
    document.addEventListener('touchcancel', release, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      release();
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', release);
      document.removeEventListener('touchcancel', release);
    });
  }

  protected previous(): void {
    this.go(addDays(this.weekStart(), -7));
  }

  protected next(): void {
    if (!this.atLimit()) {
      this.go(addDays(this.weekStart(), 7));
    }
  }

  /** Back to this week (BILLIAMVT-58); the link goes away, so focus goes to the week's title. */
  protected backToThisWeek(): void {
    this.go(this.thisWeek());
    focusLater(this.host, '#week-title');
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
    // Where the row was, so Undo can put it back in the same place if it left this week
    const index = this.schedule()?.occurrences.findIndex((o) => o.id === id) ?? -1;
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
        // A toast, not a notice in the page, so nothing moves (BILLIAMVT-28); screen readers read it
        this.toast.show(`${moved.taskName} moved to ${dayLabel(moved.date)}.`, this.undoMove(occurrence, index));
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

  /** A drag started: remember its day and that day's height, so the week stays still. */
  protected dragStarted(event: CdkDragStart<ScheduledOccurrence>): void {
    // The day is the row's drop list; the row itself has already been swapped for its placeholder
    const day = event.source.dropContainer?.element.nativeElement as HTMLElement | undefined;
    this.dragFromHeight.set(day?.getBoundingClientRect().height ?? null);
    this.dragFrom.set(event.source.data.date);
  }

  /** Follows the finger: which day, if any, a drop would land on. */
  protected dragMoved(event: CdkDragMove<ScheduledOccurrence>): void {
    const { x, y } = event.pointerPosition;
    const day = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.day');
    const date = day?.dataset['date'] ?? null;
    this.dropOver.set(date !== null && date >= (this.schedule()?.today ?? '') ? date : null);
  }

  protected dragEnded(): void {
    this.dropOver.set(null);
    this.dragFrom.set(null);
    this.dragFromHeight.set(null);
  }

  /** Pending days of tasks that still exist can be dragged, while the flag is on. */
  protected canDrag(occurrence: ScheduledOccurrence): boolean {
    return (
      this.dragEnabled() &&
      occurrence.status === 'PENDING' &&
      !occurrence.taskDeleted &&
      !this.saving().has(occurrence.id)
    );
  }

  /**
   * A row dropped on another day (BILLIAMVT-28): it moves at once, then the move is saved with the
   * same API as Move. If saving fails, it goes back; a day that changed meanwhile reloads the week
   * with BILLIAMVT-55's notices. Only a drop with the finger on a day counts: let go anywhere else
   * (e.g. below the week) and it goes back, even though the CDK still has it in the last day passed.
   */
  protected dropped(event: CdkDragDrop<string, string, ScheduledOccurrence>): void {
    this.dragEnded();
    const occurrence = event.item.data;
    const date = event.container.data;
    if (!event.isPointerOverContainer || event.previousContainer === event.container || date === occurrence.date) {
      return;
    }
    const id = occurrence.id;
    const place = (o: ScheduledOccurrence) =>
      this.schedule.update(
        (schedule) => schedule && { ...schedule, occurrences: schedule.occurrences.map((x) => (x.id === id ? o : x)) },
      );
    this.menuOpen.set(null);
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, id));
    place({ ...occurrence, date, overdue: false });
    this.saving.update((ids) => new Set(ids).add(id));
    this.schedules.move(id, date).subscribe({
      next: (moved) => {
        place(moved);
        this.saving.update((ids) => removeId(ids, id));
        this.toast.show(`${moved.taskName} moved to ${dayLabel(moved.date)}.`, this.undoMove(occurrence));
      },
      error: (err: unknown) => {
        place(occurrence);
        this.failed(occurrence, err);
      },
    });
  }

  /**
   * Undo for a move's toast (BILLIAMVT-28): moves the day back, with the same API. None when the day
   * was in the past (an overdue day moved forward), because the API refuses moving to a past day.
   * If the day changed in the meantime, the week reloads with BILLIAMVT-55's notices.
   */
  private undoMove(before: ScheduledOccurrence, index = -1): ToastAction | undefined {
    if (before.date < (this.schedule()?.today ?? '')) {
      return undefined;
    }
    const id = before.id;
    return {
      label: 'Undo',
      run: () => {
        this.notice.set(null);
        this.itemErrors.update((errors) => removeError(errors, id));
        this.saving.update((ids) => new Set(ids).add(id));
        this.schedules.move(id, before.date).subscribe({
          next: (back) => {
            this.schedule.update((schedule) => {
              if (!schedule) {
                return schedule;
              }
              const occurrences = schedule.occurrences;
              if (occurrences.some((o) => o.id === id)) {
                return { ...schedule, occurrences: occurrences.map((o) => (o.id === id ? back : o)) };
              }
              // It had left this week: back in its old place
              const at = index < 0 ? occurrences.length : Math.min(index, occurrences.length);
              return { ...schedule, occurrences: [...occurrences.slice(0, at), back, ...occurrences.slice(at)] };
            });
            this.saving.update((ids) => removeId(ids, id));
            this.toast.show(`${back.taskName} moved back to ${dayLabel(back.date)}.`);
            // The Undo button is gone, so focus goes to the row's ⋯ button
            this.focusMore(id);
          },
          error: (err: unknown) => this.failed(before, err),
        });
      },
    };
  }

  /**
   * Assign in the ⋯ menu (BILLIAMVT-64): gives this day its own assignee, or Anyone. The task and
   * its other days keep theirs.
   */
  protected startAssign(occurrence: ScheduledOccurrence): void {
    this.menuOpen.set(null);
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, occurrence.id));
    this.assignChoice.set(occurrence.assigneeId);
    this.choosingAssign.set(occurrence.id);
  }

  protected confirmAssign(): void {
    const occurrence = this.pendingAssign();
    if (!occurrence) {
      return;
    }
    const id = occurrence.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.schedules.assign(id, this.assignChoice()).subscribe({
      next: (assigned) => {
        this.schedule.update(
          (schedule) => schedule && { ...schedule, occurrences: schedule.occurrences.map((o) => (o.id === id ? assigned : o)) },
        );
        this.saving.update((ids) => removeId(ids, id));
        this.choosingAssign.set(null);
        const who = assigned.assigneeName ? firstName(assigned.assigneeName) : 'Anyone';
        this.toast.show(`${assigned.taskName} on ${dayLabel(assigned.date)}: ${who}.`, this.undoAssign(occurrence));
        this.focusMore(id);
      },
      error: (err: unknown) => {
        if (isStale(err)) {
          this.choosingAssign.set(null);
          this.failed(occurrence, err);
        } else {
          this.saving.update((ids) => removeId(ids, id));
          this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        }
      },
    });
  }

  /**
   * Undo for an assign's toast: puts the day back exactly as it was, following its task again if it
   * had no assignee of its own, or its previous one if it did. If the day changed in the meantime,
   * the week reloads with BILLIAMVT-55's notices.
   */
  private undoAssign(before: ScheduledOccurrence): ToastAction {
    const id = before.id;
    return {
      label: 'Undo',
      run: () => {
        this.notice.set(null);
        this.itemErrors.update((errors) => removeError(errors, id));
        this.saving.update((ids) => new Set(ids).add(id));
        const request = before.assignmentSet
          ? this.schedules.assign(id, before.assigneeId)
          : this.schedules.followTask(id);
        request.subscribe({
          next: (back) => {
            this.schedule.update(
              (schedule) => schedule && { ...schedule, occurrences: schedule.occurrences.map((o) => (o.id === id ? back : o)) },
            );
            this.saving.update((ids) => removeId(ids, id));
            const who = back.assigneeName ? firstName(back.assigneeName) : 'Anyone';
            this.toast.show(`${back.taskName} on ${dayLabel(back.date)}: back to ${who}.`);
            // The Undo button is gone, so focus goes to the row's ⋯ button
            this.focusMore(id);
          },
          error: (err: unknown) => this.failed(before, err),
        });
      },
    };
  }

  /** The assign sheet was cancelled: focus goes back to the row's ⋯ button. */
  protected cancelAssign(): void {
    const id = this.choosingAssign();
    this.choosingAssign.set(null);
    if (id !== null) {
      this.itemErrors.update((errors) => removeError(errors, id));
      this.focusMore(id);
    }
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
    this.choosingAssign.set(null);
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

  /** Loading the week failed: try again (BILLIAMVT-53). */
  protected retry(): void {
    this.load();
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
    // Only the latest week counts: tapping ‹ or › again drops the reply for the week before it,
    // so the arrows don't have to be disabled while a week loads (BILLIAMVT-58)
    this.loadRequest?.unsubscribe();
    clearTimeout(this.dimTimer);
    this.loading.set(true);
    this.error.set(null);
    // Dim the days only if the week is slow to come, so a quick change doesn't flicker
    this.dimTimer = setTimeout(() => this.dimmed.set(this.loading()), DIM_AFTER_MS);
    this.loadRequest = this.schedules.between(this.weekStart(), this.weekEnd()).subscribe({
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
        this.loaded();
        after?.(schedule);
      },
      error: (err: unknown) => {
        this.noHousehold.set(err instanceof HttpErrorResponse && err.status === 404);
        this.error.set(errorMessage(err));
        this.loaded();
      },
    });
  }

  private loaded(): void {
    clearTimeout(this.dimTimer);
    this.loading.set(false);
    this.dimmed.set(false);
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

/**
 * A day is mine when it's assigned to me or to Anyone (still mine to pick up), or I'm the one who
 * did or skipped it (BILLIAMVT-66).
 */
function isMine(occurrence: ScheduledOccurrence, me: number | null): boolean {
  return occurrence.assigneeId === null || occurrence.assigneeId === me || (me !== null && occurrence.completedById === me);
}

function readFilter(): WeekFilter {
  try {
    return localStorage.getItem(FILTER_KEY) === 'mine' ? 'mine' : 'everyone';
  } catch {
    return 'everyone';
  }
}
