import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';
import { Household } from '../household/household.models';
import { HouseholdService } from '../household/household.service';

/** Household settings (BILLIAMVT-46) and the user's account, including deleting it (BILLIAMVT-41). */
@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly router = inject(Router);
  private readonly households = inject(HouseholdService);
  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly auth = inject(AuthService);

  /** Null while loading, or if the user has no household. */
  protected readonly household = signal<Household | null>(null);
  protected readonly householdLoaded = signal(false);
  protected readonly renaming = signal(false);
  protected readonly saving = signal(false);
  protected readonly renameError = signal<string | null>(null);
  protected readonly renameForm = this.formBuilder.group({ name: ['', [Validators.required, Validators.maxLength(100)]] });

  /** Deleting takes two steps: open the confirmation, then confirm with the password. */
  protected readonly confirming = signal(false);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.formBuilder.group({ password: ['', Validators.required] });

  constructor() {
    this.households.load().subscribe({
      next: (household) => {
        this.household.set(household);
        this.householdLoaded.set(true);
      },
      // Deleting the account still works without it; the warning is just more general
      error: () => this.householdLoaded.set(true),
    });
  }

  protected startRename(household: Household): void {
    this.renameForm.setValue({ name: household.name });
    this.renameError.set(null);
    this.renaming.set(true);
  }

  protected cancelRename(): void {
    this.renaming.set(false);
    this.renameError.set(null);
  }

  protected saveName(): void {
    if (this.renameForm.invalid) {
      this.renameError.set('Enter a name of up to 100 characters.');
      return;
    }
    this.saving.set(true);
    this.renameError.set(null);
    this.households.update({ name: this.renameForm.controls.name.value.trim() }).subscribe({
      next: (household) => {
        this.household.set(household);
        this.renaming.set(false);
        this.saving.set(false);
      },
      error: (err: unknown) => {
        this.renameError.set(errorMessage(err));
        this.saving.set(false);
      },
    });
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
