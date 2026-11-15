import { Injectable, signal } from '@angular/core';

/**
 * Tells screen-reader users what just changed, e.g. "Vacuum marked done" (WCAG 4.1.3, BILLIAMVT-49).
 * The app shell shows the message in a hidden live region; sighted users see the change itself.
 */
@Injectable({ providedIn: 'root' })
export class Announcer {
  readonly message = signal('');

  announce(text: string): void {
    // Cleared first, so the same words twice in a row are still read out
    this.message.set('');
    setTimeout(() => this.message.set(text));
  }
}
