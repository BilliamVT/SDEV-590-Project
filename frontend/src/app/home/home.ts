import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { Backlog } from '../backlog/backlog';
import { HouseholdCard } from '../household/household-card';
import { WeekView } from '../schedule/week-view';

/**
 * The week first, with adding a task one tap away (BILLIAMVT-49). The household's details and the
 * server status are in Settings; a new account sets up its household here.
 */
@Component({
  selector: 'app-home',
  imports: [Backlog, HouseholdCard, RouterLink, WeekView],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly auth = inject(AuthService);
}
