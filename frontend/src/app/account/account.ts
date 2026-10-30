import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';
import { Household } from '../household/household.models';
import { HouseholdService } from '../household/household.service';

/** The user's account settings. For now: deleting the account (BILLIAMVT-41). */
@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  /** Null while loading, or if the user has no household. */
  protected readonly household = signal<Household | null>(null);
  /** Deleting takes two steps: open the confirmation, then confirm with the password. */
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({ password: ['', Validators.required] });

  constructor() {
    // Only used to explain what happens to the household; deletion works without it
    inject(HouseholdService)
      .load()
      .subscribe({ next: (household) => this.household.set(household), error: () => undefined });
  }

  protected consequence(household: Household | null): string {
    if (!household) {
      return 'Your account and everything linked to it will be deleted.';
    }
    return household.members.length === 1
      ? `You're the only member of ${household.name}, so it and all its tasks will be deleted too.`
      : `You'll be removed from ${household.name}. Its other members keep its tasks and history; tasks you completed will no longer show your name.`;
  }

  protected cancel(): void {
    this.confirming.set(false);
    this.form.reset();
    this.error.set(null);
  }

  protected delete(): void {
    if (this.form.invalid) {
      this.error.set('Enter your password to confirm.');
      return;
    }
    this.deleting.set(true);
    this.error.set(null);
    this.auth.deleteAccount(this.form.controls.password.value).subscribe({
      next: () => void this.router.navigate(['/login'], { queryParams: { deleted: 1 } }),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.deleting.set(false);
      },
    });
  }
}
