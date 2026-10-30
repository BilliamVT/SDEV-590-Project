import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';
import { Household } from './household.models';
import { HouseholdService } from './household.service';

/** Shown until the user belongs to a household: create one, or join one with an invite code. */
@Component({
  selector: 'app-household-setup',
  imports: [ReactiveFormsModule],
  templateUrl: './household-setup.html',
  styleUrl: './household-card.scss',
})
export class HouseholdSetup {
  private readonly households = inject(HouseholdService);
  private readonly formBuilder = inject(FormBuilder).nonNullable;

  /** Emits the household once the user has created or joined one. */
  readonly ready = output<Household>();

  protected readonly createForm = this.formBuilder.group({
    name: [`${inject(AuthService).user()?.displayName ?? 'My'}'s household`, [Validators.required, Validators.maxLength(100)]],
  });
  protected readonly joinForm = this.formBuilder.group({ code: ['', Validators.required] });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected create(): void {
    if (this.createForm.invalid) {
      this.error.set('Enter a name for your household.');
      return;
    }
    this.run(this.households.create(this.createForm.controls.name.value.trim()));
  }

  protected join(): void {
    if (this.joinForm.invalid) {
      this.error.set('Enter an invite code.');
      return;
    }
    this.run(this.households.join(this.joinForm.controls.code.value));
  }

  private run(request: Observable<Household>): void {
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (household) => this.ready.emit(household),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
