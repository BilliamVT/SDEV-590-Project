import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { errorMessage } from '../auth/error-message';
import { Household } from './household.models';
import { HouseholdSetup } from './household-setup';
import { HouseholdService, formatInviteCode } from './household.service';

/**
 * The user's household on the home page: members, the invite code, and joining another household.
 * Until the user has one, shows the create-or-join step instead.
 */
@Component({
  selector: 'app-household-card',
  imports: [ReactiveFormsModule, HouseholdSetup],
  templateUrl: './household-card.html',
  styleUrl: './household-card.scss',
})
export class HouseholdCard {
  private readonly households = inject(HouseholdService);

  protected readonly household = signal<Household | null>(null);
  protected readonly needsSetup = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  /** Joining takes two steps: enter the code, then confirm leaving the current household. */
  protected readonly confirming = signal(false);
  protected readonly joinForm = inject(FormBuilder).nonNullable.group({ code: ['', Validators.required] });
  protected readonly format = formatInviteCode;

  constructor() {
    this.households.load().subscribe({
      next: (household) => {
        this.household.set(household);
        this.needsSetup.set(household === null);
      },
      error: (err: unknown) => this.error.set(errorMessage(err)),
    });
  }

  protected setUp(household: Household): void {
    this.household.set(household);
    this.needsSetup.set(false);
  }

  protected leaveWarning(household: Household): string {
    return household.members.length === 1
      ? `You'll leave ${household.name}. Because you're its only member, it will be deleted along with its tasks.`
      : `You'll leave ${household.name}. Its other members will stay in it.`;
  }

  protected askToJoin(): void {
    this.error.set(null);
    if (this.joinForm.invalid) {
      this.error.set('Enter an invite code.');
      return;
    }
    this.confirming.set(true);
  }

  protected join(): void {
    this.run(this.households.join(this.joinForm.controls.code.value), () => {
      this.confirming.set(false);
      this.joinForm.reset();
    });
  }

  protected regenerate(): void {
    this.copied.set(false);
    this.run(this.households.regenerateInviteCode());
  }

  protected copy(code: string): void {
    // Not available on insecure (http) pages other than localhost
    navigator.clipboard?.writeText(formatInviteCode(code)).then(() => this.copied.set(true));
  }

  private run(request: ReturnType<HouseholdService['join']>, done?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (household) => {
        this.household.set(household);
        this.busy.set(false);
        done?.();
      },
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
        this.confirming.set(false);
      },
    });
  }
}
