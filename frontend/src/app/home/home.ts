import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { HealthService } from '../health/health.service';
import { HouseholdCard } from '../household/household-card';
import { WeekView } from '../schedule/week-view';

type ServerState = 'checking' | 'up' | 'down' | 'unreachable';

@Component({
  selector: 'app-home',
  imports: [HouseholdCard, RouterLink, WeekView],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private readonly health = inject(HealthService);
  protected readonly auth = inject(AuthService);

  protected readonly state = signal<ServerState>('checking');
  protected readonly reportedStatus = signal<string | null>(null);
  /** Set when arriving from the New task form (BILLIAMVT-39). */
  protected readonly savedTask = inject(Router).currentNavigation()?.extras.state?.['savedTask'] as
    | { name: string; schedule: string }
    | undefined;

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
