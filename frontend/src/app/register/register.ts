import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { errorMessage } from '../auth/error-message';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: '../auth/auth-form.scss',
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Same rules as the backend's RegisterRequest
  protected readonly form = inject(FormBuilder).nonNullable.group({
    displayName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
  });
  /** Field errors appear only after a submit attempt, so the page doesn't shift while typing. */
  protected readonly attempted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    this.attempted.set(true);
    if (this.form.invalid) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/']),
      error: (err: unknown) => {
        this.error.set(errorMessage(err));
        this.submitting.set(false);
      },
    });
  }
}
