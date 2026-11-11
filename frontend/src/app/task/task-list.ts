import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { errorMessage } from '../auth/error-message';
import { Task } from './task.models';
import { TaskService } from './task.service';

/** The household's tasks, with edit, pause/resume and delete (BILLIAMVT-22). */
@Component({
  selector: 'app-task-list',
  imports: [RouterLink],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
})
export class TaskList {
  private readonly tasks = inject(TaskService);

  protected readonly list = signal<Task[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<number | null>(null);
  /** Deleting takes two steps: "Delete…", then confirm. */
  protected readonly confirmingId = signal<number | null>(null);
  /** Set when arriving from the edit form. */
  protected readonly savedTask = inject(Router).currentNavigation()?.extras.state?.['savedTask'] as
    | { name: string; schedule: string }
    | undefined;

  constructor() {
    this.tasks.list().subscribe({
      next: (tasks) => this.list.set(tasks),
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }

  protected minutes(task: Task): string | null {
    return task.estimatedMinutes ? `${task.estimatedMinutes} min` : null;
  }

  protected togglePause(task: Task): void {
    this.run(task, task.active ? this.tasks.pause(task.id) : this.tasks.resume(task.id), (updated) =>
      this.list.update((tasks) => tasks!.map((t) => (t.id === updated.id ? updated : t))),
    );
  }

  protected delete(task: Task): void {
    this.run(task, this.tasks.delete(task.id), () => {
      this.confirmingId.set(null);
      this.list.update((tasks) => tasks!.filter((t) => t.id !== task.id));
    });
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
