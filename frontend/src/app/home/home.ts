import { Component, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { HealthService } from '../health/health.service';
import { HouseholdCard } from '../household/household-card';

type ServerState = 'checking' | 'up' | 'down' | 'unreachable';

@Component({
  selector: 'app-home',
  imports: [HouseholdCard],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly health = inject(HealthService);
  protected readonly auth = inject(AuthService);

  protected readonly state = signal<ServerState>('checking');
  protected readonly reportedStatus = signal<string | null>(null);

  constructor() {
    this.health.status().subscribe({
      next: (status) => {
        this.reportedStatus.set(status);
        this.state.set(status === 'UP' ? 'up' : 'down');
      },
      error: () => this.state.set('unreachable'),
    });
  }
}
