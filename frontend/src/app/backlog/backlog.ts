import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import { errorMessage } from '../auth/error-message';
import { dayLabel, toIsoDate } from '../schedule/dates';
import { BacklogItem } from './backlog.models';
import { BacklogService } from './backlog.service';

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
  imports: [ReactiveFormsModule],
  templateUrl: './backlog.html',
  styleUrl: './backlog.scss',
})
export class Backlog {
  private readonly backlog = inject(BacklogService);

  /** An item went onto a day, so the week view should reload. */
  readonly placed = output<void>();

  protected readonly today = toIsoDate(new Date());
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
  protected readonly adding = signal(false);
  protected readonly addError = signal<string | null>(null);

  protected readonly picking = signal<Picking | null>(null);
  protected readonly saving = signal<ReadonlySet<number>>(new Set());
  protected readonly itemErrors = signal<ReadonlyMap<number, string>>(new Map());

  constructor() {
    this.reload();
  }

  /** Called after the week view changes (a removed day puts its item back here), or the household changes. */
  reload(): void {
    this.notice.set(null);
    this.backlog.list().subscribe({
      next: (items) => {
        this.items.set(items);
        this.noHousehold.set(false);
        this.error.set(null);
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
      },
      error: (err: unknown) => {
        this.addError.set(errorMessage(err));
        this.adding.set(false);
      },
    });
  }

  /** Opens the day picker; it starts on today for both actions. */
  protected pick(item: BacklogItem, action: Picking['action']): void {
    this.picking.set({ id: item.id, action, date: this.today });
    this.notice.set(null);
    this.itemErrors.update((errors) => removeError(errors, item.id));
  }

  protected setDate(date: string): void {
    this.picking.update((picking) => picking && { ...picking, date });
  }

  protected cancel(): void {
    this.picking.set(null);
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
      this.notice.set(message);
      this.placed.emit();
    });
  }

  protected delete(item: BacklogItem): void {
    if (!confirm(`Delete "${item.name}" from the backlog?`)) {
      return;
    }
    this.run(item, this.backlog.delete(item.id), () => this.notice.set(null));
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
        this.itemErrors.update((errors) => new Map(errors).set(id, errorMessage(err)));
        this.saving.update((ids) => removeId(ids, id));
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
