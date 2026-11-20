import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { errorMessage } from '../auth/error-message';
import { Announcer } from '../shared/announcer';
import { ConfirmSheet } from '../shared/confirm-sheet';
import { focusLater } from '../shared/focus';
import { shortDayLabel } from '../schedule/dates';
import { Task } from './task.models';
import { TaskService } from './task.service';

/** The household's tasks, with edit, pause/resume and delete (BILLIAMVT-22). */
@Component({
  selector: 'app-task-list',
  imports: [ConfirmSheet, RouterLink],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
})
export class TaskList {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly announcer = inject(Announcer);
  private readonly tasks = inject(TaskService);

  protected readonly list = signal<Task[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<number | null>(null);
  /** Deleting takes two steps: "Delete…", then confirm. */
  protected readonly confirmingId = signal<number | null>(null);
  /** The task the delete action sheet is open for (BILLIAMVT-49) */
  protected readonly pendingDelete = computed(() => this.list()?.find((t) => t.id === this.confirmingId()) ?? null);
  /** Set when arriving from the edit form. */
  protected readonly savedTask = inject(Router).currentNavigation()?.extras.state?.['savedTask'] as
    | { name: string; schedule: string }
    | undefined;

  constructor() {
    this.load();
  }

  /** Also the Try again button when loading failed (BILLIAMVT-53). */
  protected load(): void {
    this.error.set(null);
    this.tasks.list().subscribe({
      next: (tasks) => this.list.set(tasks),
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }

  protected minutes(task: Task): string | null {
    return task.estimatedMinutes ? `${task.estimatedMinutes} min` : null;
  }

  /** "Last done Thu, Nov 12 by Sam", or "Not done yet" (BILLIAMVT-26) */
  protected lastDone(task: Task): string {
    const last = task.lastDone;
    if (!last) {
      return 'Not done yet';
    }
    return `Last done ${shortDayLabel(last.date)} by ${last.byName ?? 'a former member'}`;
  }

  protected togglePause(task: Task): void {
    this.run(task, task.active ? this.tasks.pause(task.id) : this.tasks.resume(task.id), (updated) => {
      this.list.update((tasks) => tasks!.map((t) => (t.id === updated.id ? updated : t)));
      this.announcer.announce(`${task.name} ${updated.active ? 'resumed' : 'paused'}`);
    });
  }

  protected delete(task: Task): void {
    this.run(task, this.tasks.delete(task.id), () => {
      this.confirmingId.set(null);
      this.list.update((tasks) => tasks!.filter((t) => t.id !== task.id));
      this.announcer.announce(`${task.name} deleted`);
      // The row is gone: focus the page heading, so keyboard users stay in place (BILLIAMVT-49)
      focusLater(this.host, 'h2');
    });
  }

  /** The action sheet was cancelled: focus goes back to that task's Delete button. */
  protected cancelDelete(): void {
    const id = this.confirmingId();
    this.confirmingId.set(null);
    if (id !== null) {
      focusLater(this.host, `[data-delete="${id}"]`);
    }
  }

  private run<T>(task: Task, request: Observable<T>, done: (result: T) => void): void {
    this.busyId.set(task.id);
    this.error.set(null);
    request.subscribe({
      next: (result) => {
        done(result);
        this.busyId.set(null);
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busyId.set(null);
      },
    });
  }
}
