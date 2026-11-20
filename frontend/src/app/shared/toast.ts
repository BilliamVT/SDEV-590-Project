import { Injectable, inject, signal } from '@angular/core';

import { Announcer } from './announcer';

/**
 * How long a toast stays on screen: Material's shortest snackbar time. It doesn't hide while it's
 * touched, hovered or focused, so anyone who needs longer can keep it (WCAG 2.2.1).
 */
export const TOAST_MS = 4000;
/** A toast with a button (e.g. Undo) stays longer, so there's time to reach it. */
export const TOAST_ACTION_MS = 6000;

/** A button on a toast, e.g. Undo after a move. */
export interface ToastAction {
  label: string;
  run: () => void;
}

/**
 * A short confirmation that floats at the bottom of the screen and fades away, e.g. "Vacuum moved
 * to Friday, Nov 20." (BILLIAMVT-28), optionally with one button such as Undo. Unlike a notice in
 * the page, it doesn't push anything down, so the week doesn't jump after a drag. Screen readers get
 * the message through the Announcer (BILLIAMVT-49), once. For confirmations only: anything the user
 * needs to act on stays in the page.
 */
@Injectable({ providedIn: 'root' })
export class Toast {
  private readonly announcer = inject(Announcer);
  /** The last message; kept after hiding, so the toast fades out with its text still in it */
  readonly message = signal<string | null>(null);
  readonly action = signal<ToastAction | null>(null);
  readonly shown = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** What's holding it open: a finger or mouse on it, or keyboard focus in it */
  private readonly held = new Set<'pointer' | 'focus'>();

  show(text: string, action?: ToastAction): void {
    this.message.set(text);
    this.action.set(action ?? null);
    this.shown.set(true);
    this.announcer.announce(text);
    this.startTimer();
  }

  hide(): void {
    clearTimeout(this.timer);
    // A hidden toast gets no leave or blur events, so nothing can hold the next one open by mistake
    this.held.clear();
    this.shown.set(false);
  }

  /**
   * Holds the toast open while it's touched, hovered or focused; letting go gives it its full time
   * again, so there's time to read it after looking away.
   */
  hold(by: 'pointer' | 'focus', holding: boolean): void {
    if (!this.shown()) {
      return;
    }
    if (holding) {
      this.held.add(by);
      clearTimeout(this.timer);
    } else if (this.held.delete(by)) {
      this.startTimer();
    }
  }

  private startTimer(): void {
    clearTimeout(this.timer);
    if (this.held.size === 0) {
      this.timer = setTimeout(() => this.hide(), this.action() ? TOAST_ACTION_MS : TOAST_MS);
    }
  }

  /** The toast's button was pressed: it hides, then the action runs (and may show a new toast). */
  act(): void {
    const action = this.action();
    if (!this.shown() || !action) {
      return;
    }
    this.hide();
    action.run();
  }
}
