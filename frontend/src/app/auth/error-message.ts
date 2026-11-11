import { HttpErrorResponse } from '@angular/common/http';

const GENERIC_VALIDATION_DETAIL = 'Invalid request content.';

/** Turns an API error into a sentence for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "The server couldn't be reached. Try again in a minute.";
    }
    const detail = (error.error as { detail?: unknown } | null)?.detail;
    // Spring's own validation errors say only this; our 400s explain the problem
    if (typeof detail === 'string' && detail !== GENERIC_VALIDATION_DETAIL) {
      return detail;
    }
    if (error.status === 400) {
      return 'Please check the details you entered.';
    }
  }
  return 'Something went wrong. Please try again.';
}
