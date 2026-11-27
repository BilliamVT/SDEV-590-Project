import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

let nextId = 0;

/**
 * Asks before a destructive action, the way iPhone apps do (BILLIAMVT-49): an action sheet that
 * slides up from the bottom on a phone, with the sentence, a red confirm button and Cancel; a small
 * centred dialog on wider screens. Built on the browser's <dialog>, which keeps keyboard focus
 * inside, closes on Escape and dims the page. Cancel has the focus, so Enter never deletes by
 * accident. Stays open while busy, and shows an error if the action fails.
 *
 * It can also hold a small form, e.g. a day to move to (BILLIAMVT-56): content placed inside goes
 * between the sentence and the buttons, and an autofocus field there gets the focus instead of
 * Cancel. {@code confirmClass} "primary" makes the confirm button the app's color, not red.
 */
@Component({
  selector: 'app-confirm-sheet',
  templateUrl: './confirm-sheet.html',
  styleUrl: './confirm-sheet.scss',
})
export class ConfirmSheet {
  readonly open = input(false);
  readonly message = input('');
  readonly confirmLabel = input('Delete');
  readonly busyLabel = input('Deleting…');
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly confirmClass = input<'danger' | 'primary'>('danger');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly messageId = `confirm-sheet-${nextId++}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        // Older test DOMs have no showModal
        if (typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      } else if (!this.open() && dialog.open) {
        if (typeof dialog.close === 'function') {
          dialog.close();
        } else {
          dialog.removeAttribute('open');
        }
      }
    });
  }

  protected cancel(): void {
    if (!this.busy()) {
      this.cancelled.emit();
    }
  }

  /** Escape: the browser would close the dialog itself; let the page decide instead. */
  protected onCancelEvent(event: Event): void {
    event.preventDefault();
    this.cancel();
  }

  /** A tap on the dimmed page around the sheet cancels, as on iPhone. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.cancel();
    }
  }
}
