import { Component, inject, signal } from '@angular/core';

import { HealthService } from './health.service';

type ServerState = 'checking' | 'up' | 'down' | 'unreachable';

/** Whether the backend and its database are running; in Settings since BILLIAMVT-49. */
@Component({
  selector: 'app-server-status',
  template: `
    <p class="status" [attr.data-state]="state()">
      @switch (state()) {
        @case ('checking') {
          Checking the server… The server sleeps when it isn't in use, so the first check can take up to a minute.
        }
        @case ('up') {
          The server and database are running.
        }
        @case ('down') {
          The server is running but reports a problem (status: {{ reportedStatus() }}).
        }
        @case ('unreachable') {
          The server couldn't be reached. Try again in a minute.
        }
      }
    </p>
  `,
  styles: `
    .status {
      margin: 0;
      padding-left: var(--space-3);
      border-left: 4px solid var(--color-neutral);

      &[data-state='up'] {
        border-color: var(--color-success);
      }

      &[data-state='down'],
      &[data-state='unreachable'] {
        border-color: var(--color-danger);
      }
    }
  `,
})
export class ServerStatus {
  protected readonly state = signal<ServerState>('checking');
  protected readonly reportedStatus = signal<string | null>(null);

  constructor() {
    inject(HealthService)
      .status()
      .subscribe({
        next: (status) => {
          this.reportedStatus.set(status);
          this.state.set(status === 'UP' ? 'up' : 'down');
        },
        error: () => this.state.set('unreachable'),
      });
  }
}
