import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from './auth/auth.service';
import { Announcer } from './shared/announcer';
import { AppUpdate } from './shared/app-update';
import { Toast } from './shared/toast';

@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly announcer = inject(Announcer);
  protected readonly toast = inject(Toast);

  constructor() {
    // A home-screen app left open picks up a new deploy when it comes back into view (BILLIAMVT-53)
    inject(AppUpdate).start();
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
