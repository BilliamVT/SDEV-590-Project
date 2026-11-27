import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import { errorMessage } from '../auth/error-message';
import { firstName } from '../household/household.models';
import { HouseholdService } from '../household/household.service';
import { Announcer } from '../shared/announcer';
import { Toast, ToastAction } from '../shared/toast';
import { focusFirstInvalid, focusLater } from '../shared/focus';
import { dayLabel } from '../schedule/dates';
import { isStale } from '../schedule/stale';
import { ConfirmSheet } from '../shared/confirm-sheet';
import { BacklogItem } from './backlog.models';
import { BacklogService } from './backlog.service';
import { TaskColorDot } from '../task/task-color-dot';

/** Choosing a day for one item: the day it was done, or the day to do it. */
interface Picking {
  id: number;
  action: 'done' | 'schedule';
  date: string;
}

/**
 * One-off items with no set day, listed under the week (BILLIAMVT-23). Putting one on a day,
 * scheduled or done, moves it into the week view, where it works like any task.
 */
@Component({
  selector: 'app-backlog',
  host: {
    // A ⋯ menu closes on a tap anywhere else, or Escape (BILLIAMVT-49)
    '(document:click)': 'closeMenuOutside($event)',
    '(document:keydown.escape)': 'closeMenu()',
    // Back in the app: items may have changed on another phone (BILLIAMVT-55)
    '(document:visibilitychange)': 'refreshIfVisible()',
  },
  imports: [ConfirmSheet, ReactiveFormsModule, TaskColorDot],
  templateUrl: './backlog.html',
  styleUrl: './backlog.scss',
})
export class Backlog {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly announcer = inject(Announcer);
  private readonly toast = inject(Toast);
  private readonly backlog = inject(BacklogService);
  private readonly households = inject(HouseholdService);

  /** An item went onto a day, so the week view should reload. */
  readonly placed = output<void>();

  protected readonly items = signal<BacklogItem[] | null>(null);
  protected readonly error = signal<string | null>(null);
  /** The user has no household yet; the household card asks them to set one up. */
  protected readonly noHousehold = signal(false);
  /** Confirms an item went onto a day; cleared by the next change here or in the week. */
  protected readonly notice = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    estimatedMinutes: [null as number | null, [Validators.min(1), Validators.max(1440)]],
  });
  protected readonly attempted = signal(false);
  /** Field errors show after a try to add; each is linked to its field for screen readers (BILLIAMVT-49) */
  protected nameInvalid(): boolean {
    const name = this.form.controls.name;
    return this.attempted() && (name.invalid || name.value?.trim() === '');
  }

  protected minutesInvalid(): boolean {
    return this.attempted() && this.form.controls.estimatedMinutes.invalid;
  }
  protected readonly adding = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly picking = signal<Picking | null>(null);
  /** The item whose ⋯ menu (Mark done, Delete) is open */
  protected readonly menuOpen = signal<number | null>(null);
  /** The item the delete action sheet is open for */
  protected readonly confirmingDelete = signal<number | null>(null);
  protected readonly pendingDelete = computed(() => this.items()?.find((i) => i.id === this.confirmingDelete()) ?? null);
  /** The item the assign sheet is open for, and the member chosen in it (null: Anyone) (BILLIAMVT-64) */
  protected readonly choosingAssign = signal<number | null>(null);
  protected readonly assignChoice = signal<number | null>(null);
  protected readonly pendingAssign = computed(() => this.items()?.find((i) => i.id === this.choosingAssign()) ?? null);
  protected readonly assignMessage = computed(() => {
    const item = this.pendingAssign();
    return item ? `Who's doing ${item.name}?` : '';
  });
  /** The household's members; the week view beside this list loads them */
  protected readonly members = this.households.members;
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  protected readonly itemErrors = signal<ReadonlyMap<number, string>>(new Map());

  constructor() {
    this.reload();
  }

  /**
   * Called after the week view changes (a removed day puts its item back here), or the household
   * changes. {@code after} runs once the list has loaded.
   */
  /** Loading the backlog failed: try again (BILLIAMVT-53). */
  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  reload(after?: () => void): void {
    this.notice.set(null);
    this.backlog.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.noHousehold.set(false);
        this.error.set(null);
        after?.();
      },
      error: (err: unknown) => {
        this.noHousehold.set(err instanceof HttpErrorResponse && err.status === 404);
        this.error.set(errorMessage(err));
      },
    });
  }

  protected minutes(item: BacklogItem): string | null {
    return item.estimatedMinutes ? `${item.estimatedMinutes} min` : null;
  }

  protected add(): void {
    this.attempted.set(true);
    if (this.form.invalid || this.form.controls.name.value!.trim() === '') {
      focusFirstInvalid(this.host);
      return;
    }
    const { name, estimatedMinutes } = this.form.getRawValue();
    this.notice.set(null);
    this.adding.set(true);
    this.addError.set(null);
    this.backlog.create({ name: name!.trim(), ...(estimatedMinutes ? { estimatedMinutes } : {}) }).subscribe({
      next: (item) => {
        this.items.update((items) => [...(items ?? []), item]);
        this.form.reset();
        this.attempted.set(false);
        this.adding.set(false);
        this.announcer.announce(`${item.name} added to the backlog`);
      },
      error: (err: unknown) => {
        this.addError.set(errorMessage(err));
        this.adding.set(false);
      },
    });
  }

  /** The household's today (BILLIAMVT-51): the server checks picked days against it. */
  protected today(): string {
    return this.households.today();
  }

  /** Opens the day picker; it starts on today for both actions. */
  protected pick(item: BacklogItem, action: Picking['action']): void {
    this.confirmingDelete.set(null);
    this.menuOpen.set(null);
    this.picking.set({ id: item.id, action, date: this.today() });
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, item.id));
    // Straight to the day picker, which appeared under the row
    focusLater(this.host, `#backlog-day-${item.id}`);
  }

  protected setDate(date: string): void {
    this.picking.update((picking) => picking && { ...picking, date });
  }

  protected cancel(): void {
    const id = this.picking()?.id;
    this.picking.set(null);
    if (id !== undefined) {
      this.focusMore(id);
    }
  }

  protected confirm(item: BacklogItem): void {
    const picking = this.picking();
    if (!picking || picking.id !== item.id) {
      return;
    }
    if (!picking.date) {
      this.itemErrors.update((errors) => new Map(errors).set(item.id, 'Choose a day.'));
      return;
    }
    const request =
      picking.action === 'done' ? this.backlog.done(item.id, picking.date) : this.backlog.schedule(item.id, picking.date);
    const message =
      picking.action === 'done'
        ? `Marked "${item.name}" done on ${dayLabel(picking.date)}.`
        : `"${item.name}" is on ${dayLabel(picking.date)}.`;
    this.run(item, request, () => {
      this.picking.set(null);
      // A toast that goes away on its own (BILLIAMVT-57); screen readers hear it too
      this.toast.show(message);
      this.placed.emit();
      this.focusHeading();
    });
  }

  /** The assignee's first name (BILLIAMVT-64); null for Anyone, or while members are loading */
  protected assignee(item: BacklogItem): string | null {
    const member = this.members()?.find((m) => m.id === item.assigneeId);
    return member ? firstName(member.displayName) : null;
  }

  /** Assign in the ⋯ menu (BILLIAMVT-64): who the item is for, in an action sheet like the week view's. */
  protected startAssign(item: BacklogItem): void {
    this.menuOpen.set(null);
    this.picking.set(null);
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, item.id));
    this.assignChoice.set(item.assigneeId);
    this.choosingAssign.set(item.id);
  }

  protected confirmAssign(): void {
    const item = this.pendingAssign();
    if (item) {
      this.assign(item, this.assignChoice(), true);
    }
  }

  protected cancelAssign(): void {
    const id = this.choosingAssign();
    this.choosingAssign.set(null);
    if (id !== null) {
      this.itemErrors.update((errors) => removeError(errors, id));
      this.focusMore(id);
    }
  }

  /** Sends the assignee; the item stays on the list with it. The toast offers Undo unless this is the undo. */
  private assign(item: BacklogItem, assigneeId: number | null, offerUndo: boolean): void {
    const id = item.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    this.backlog.assign(id, assigneeId).subscribe({
      next: (assigned) => {
        this.items.update((items) => items && items.map((i) => (i.id === id ? assigned : i)));
        this.saving.update((ids) => removeId(ids, id));
        this.choosingAssign.set(null);
        const who = this.assignee(assigned) ?? 'Anyone';
        this.toast.show(
          offerUndo ? `${assigned.name}: ${who}.` : `${assigned.name}: back to ${who}.`,
          offerUndo ? this.undoAssign(item) : undefined,
        );
        this.focusMore(id);
      },
      error: (err: unknown) => {
        this.saving.update((ids) => removeId(ids, id));
        if (isStale(err)) {
          this.refreshAfterStale(item);
        } else {
          this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        }
      },
    });
  }

  private undoAssign(before: BacklogItem): ToastAction {
    return { label: 'Undo', run: () => this.assign(before, before.assigneeId, false) };
  }

  /** Asks first in an action sheet (BILLIAMVT-49; it used the browser's confirm before). */
  protected delete(item: BacklogItem): void {
    this.menuOpen.set(null);
    this.picking.set(null);
    this.confirmingDelete.set(item.id);
  }

  protected confirmDelete(item: BacklogItem): void {
    this.run(item, this.backlog.delete(item.id), () => {
      this.notice.set(null);
      this.confirmingDelete.set(null);
      this.announcer.announce(`${item.name} deleted`);
      this.focusHeading();
    });
  }

  /** Opens or closes an item's ⋯ menu; only one is open at a time. */
  protected toggleMenu(item: BacklogItem): void {
    this.picking.set(null);
    this.confirmingDelete.set(null);
    this.choosingAssign.set(null);
    this.menuOpen.update((open) => (open === item.id ? null : item.id));
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

  protected cancelDelete(): void {
    const id = this.confirmingDelete();
    this.confirmingDelete.set(null);
    if (id !== null) {
      this.focusMore(id);
    }
  }

  private focusMore(id: number): void {
    focusLater(this.host, `[data-more="${id}"]`);
  }

  /** The item left the list: focus the backlog's heading, so keyboard users stay in place. */
  private focusHeading(): void {
    focusLater(this.host, '#backlog-title');
  }

  /** Sends one item's change; on success the item leaves the list. */
  private run(item: BacklogItem, request: Observable<void>, done: () => void): void {
    const id = item.id;
    this.saving.update((ids) => new Set(ids).add(id));
    this.itemErrors.update((errors) => removeError(errors, id));
    request.subscribe({
      next: () => {
        this.items.update((items) => items && items.filter((i) => i.id !== id));
        this.saving.update((ids) => removeId(ids, id));
        done();
      },
      error: (err: unknown) => {
        this.saving.update((ids) => removeId(ids, id));
        if (isStale(err)) {
          this.refreshAfterStale(item);
        } else {
          this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        }
      },
    });
  }

  /**
   * The item was already put on a day or deleted, e.g. on another phone (404). Reload both lists
   * and say so, without guessing who or why: items don't record that (decision record 0007).
   */
  private refreshAfterStale(item: BacklogItem): void {
    this.picking.set(null);
    this.confirmingDelete.set(null);
    this.choosingAssign.set(null);
    this.placed.emit();
    this.reload(() => {
      this.notice.set(`${item.name} is no longer on the backlog. Your week and backlog are up to date.`);
      this.focusHeading();
    });
  }

  /** Coming back to the app reloads the list silently: a change appearing isn't an error. */
  protected refreshIfVisible(): void {
    if (document.visibilityState === 'visible' && !this.noHousehold()) {
      this.reload();
    }
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
