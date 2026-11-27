import { Component, computed, input } from '@angular/core';

import { TaskColor, colorLabel } from './task-colors';

/**
 * A task's color as a small dot before its name (BILLIAMVT-65), in the week view, the backlog and
 * Your tasks. It's never the only signal: the name is always there, and screen readers hear the
 * color's name. Nothing shows for a task with no color.
 */
@Component({
  selector: 'app-task-color-dot',
  template: `
    @if (color(); as value) {
      <span class="task-color-dot" [attr.data-color]="value" aria-hidden="true"></span>
      <span class="visually-hidden">{{ label() }}: </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .task-color-dot {
      display: inline-block;
      flex: none;
      width: 0.75rem;
      height: 0.75rem;
      margin-inline-end: 0.375rem;
      border-radius: 50%;
      background: var(--task-color);
      vertical-align: baseline;
    }
  `,
})
export class TaskColorDot {
  readonly color = input<TaskColor | null>(null);
  protected readonly label = computed(() => {
    const color = this.color();
    return color ? colorLabel(color) : '';
  });
}
