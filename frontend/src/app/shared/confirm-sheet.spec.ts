import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ConfirmSheet } from './confirm-sheet';

@Component({
  imports: [ConfirmSheet],
  template: `<app-confirm-sheet
    [open]="open()"
    message="Delete Laundry on Monday, Nov 16? Its other days stay."
    [busy]="busy()"
    [error]="error()"
    (confirmed)="confirmed = confirmed + 1"
    (cancelled)="cancelled = cancelled + 1; open.set(false)"
  />`,
})
class Host {
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  confirmed = 0;
  cancelled = 0;
}

/** A sheet holding a small form, as Move does (BILLIAMVT-56). */
@Component({
  imports: [ConfirmSheet],
  template: `<app-confirm-sheet [open]="true" message="Move Vacuum to:" confirmLabel="Move" confirmClass="primary">
    <label for="day">New day</label>
    <input id="day" type="date" autofocus />
  </app-confirm-sheet>`,
})
class FormHost {}

describe('ConfirmSheet (BILLIAMVT-49)', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const dialog = element.querySelector('dialog')!;
    const button = (text: string) => [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
    const set = async (change: () => void) => {
      change();
      await fixture.whenStable();
    };
    return { host: fixture.componentInstance, dialog, button, set, fixture };
  }

  it('opens and closes with its input, and names itself by the question', async () => {
    const { host, dialog, set } = await render();
    expect(dialog.hasAttribute('open')).toBe(false);

    await set(() => host.open.set(true));
    expect(dialog.hasAttribute('open')).toBe(true);
    const labelledBy = dialog.getAttribute('aria-labelledby')!;
    expect(dialog.querySelector(`#${labelledBy}`)?.textContent).toBe('Delete Laundry on Monday, Nov 16? Its other days stay.');

    await set(() => host.open.set(false));
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('confirms or cancels; Cancel has the focus so Enter never deletes by accident', async () => {
    const { host, button, set } = await render();
    await set(() => host.open.set(true));

    expect(button('Cancel').hasAttribute('autofocus')).toBe(true);
    button('Delete').click();
    expect(host.confirmed).toBe(1);
    button('Cancel').click();
    expect(host.cancelled).toBe(1);
  });

  it('cancels on Escape or a tap on the dimmed page, but not on a tap inside', async () => {
    const { host, dialog, set } = await render();
    await set(() => host.open.set(true));

    dialog.querySelector('p')!.click();
    expect(host.cancelled).toBe(0);
    dialog.click();
    expect(host.cancelled).toBe(1);

    await set(() => host.open.set(true));
    const escape = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(host.cancelled).toBe(2);
  });

  it('shows progress and an error, and stays open while busy', async () => {
    const { host, button, dialog, set } = await render();
    await set(() => {
      host.open.set(true);
      host.busy.set(true);
    });

    expect(button('Deleting…').disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(true);
    dialog.click();
    expect(host.cancelled).toBe(0);

    await set(() => {
      host.busy.set(false);
      host.error.set("The server couldn't be reached.");
    });
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe("The server couldn't be reached.");
  });

  it('can hold a form between the question and the buttons, with a confirm button that is not red (BILLIAMVT-56)', async () => {
    const fixture = TestBed.createComponent(FormHost);
    await fixture.whenStable();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    const panel = [...dialog.querySelector('.panel')!.children].map((c) => c.tagName.toLowerCase());

    expect(panel).toEqual(['p', 'label', 'input', 'div']);
    const move = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Move')!;
    expect(move.classList).toContain('primary');
    expect(move.classList).not.toContain('danger');
  });
});
