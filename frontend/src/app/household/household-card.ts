import { Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { errorMessage } from '../auth/error-message';
import { Household } from './household.models';
import { HouseholdSetup } from './household-setup';
import { HouseholdService, formatInviteCode } from './household.service';

/**
 * The user's household. On the home page, only the create-or-join step for a new account; in
 * Settings, the members, the invite code, and joining another household (BILLIAMVT-49).
 */
@Component({
  selector: 'app-household-card',
  imports: [ReactiveFormsModule, RouterLink, HouseholdSetup],
  templateUrl: './household-card.html',
  styleUrl: './household-card.scss',
})
export class HouseholdCard {
  private readonly households = inject(HouseholdService);

  /** The user now has a different household (set up or joined): the week and backlog should reload. */
  readonly changed = output<void>();
  /** Where the card is shown; see the class comment. */
  readonly place = input<'home' | 'settings'>('home');

  /** The household just created or joined on the home page, for a pointer to Settings. */
  protected readonly justSetUp = signal<Household | null>(null);

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
    this.load();
  }

  /** Also the Try again button when loading failed (BILLIAMVT-53). */
  protected load(): void {
    this.error.set(null);
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
    this.justSetUp.set(household);
    this.changed.emit();
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
      this.changed.emit();
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
