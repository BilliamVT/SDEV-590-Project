import { HttpErrorResponse } from '@angular/common/http';

/** Turns an API error into a sentence for the user. */
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return "The server couldn't be reached. Try again in a minute.";
    }
    const detail = (error.error as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string' && error.status !== 400) {
      return detail;
    }
    if (error.status === 400) {
      return 'Please check the details you entered.';
    }
  }
  return 'Something went wrong. Please try again.';
}
