import { TestBed } from '@angular/core/testing';

import { Announcer } from './announcer';
import { TOAST_ACTION_MS, TOAST_MS, Toast } from './toast';

describe('Toast (BILLIAMVT-28)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a message, then hides it, keeping the text while it fades', () => {
    const toast = TestBed.inject(Toast);

    toast.show('Vacuum moved to Friday, Nov 20.');
    expect(toast.shown()).toBe(true);
    expect(toast.message()).toBe('Vacuum moved to Friday, Nov 20.');
    // Screen readers hear it once, from the announcer
    vi.advanceTimersByTime(0);
    expect(TestBed.inject(Announcer).message()).toBe('Vacuum moved to Friday, Nov 20.');

    vi.advanceTimersByTime(TOAST_MS);
    expect(toast.shown()).toBe(false);
    expect(toast.message()).toBe('Vacuum moved to Friday, Nov 20.');
  });

  it('a new message replaces the last and gets its full time', () => {
    const toast = TestBed.inject(Toast);

    toast.show('First');
    vi.advanceTimersByTime(TOAST_MS - 100);
    toast.show('Second');
    vi.advanceTimersByTime(TOAST_MS - 100);

    expect(toast.shown()).toBe(true);
    expect(toast.message()).toBe('Second');
    vi.advanceTimersByTime(100);
    expect(toast.shown()).toBe(false);
  });

  it('with a button, stays longer; pressing it hides the toast and runs the action once', () => {
    const toast = TestBed.inject(Toast);
    const run = vi.fn();

    toast.show('Vacuum moved to Friday, Nov 20.', { label: 'Undo', run });
    vi.advanceTimersByTime(TOAST_MS);
    expect(toast.shown()).toBe(true);
    vi.advanceTimersByTime(TOAST_ACTION_MS - TOAST_MS);
    expect(toast.shown()).toBe(false);

    toast.show('Vacuum moved to Friday, Nov 20.', { label: 'Undo', run });
    toast.act();
    toast.act();
    expect(run).toHaveBeenCalledTimes(1);
    expect(toast.shown()).toBe(false);
  });

  it("doesn't hide while touched, hovered or focused, then gets its full time again", () => {
    const toast = TestBed.inject(Toast);

    toast.show('Vacuum moved to Friday, Nov 20.');
    vi.advanceTimersByTime(TOAST_MS - 100);
    toast.hold('pointer', true);
    toast.hold('focus', true);
    vi.advanceTimersByTime(TOAST_MS * 5);
    expect(toast.shown()).toBe(true);

    toast.hold('pointer', false);
    vi.advanceTimersByTime(TOAST_MS * 5);
    expect(toast.shown()).toBe(true);

    toast.hold('focus', false);
    vi.advanceTimersByTime(TOAST_MS - 100);
    expect(toast.shown()).toBe(true);
    vi.advanceTimersByTime(100);
    expect(toast.shown()).toBe(false);
  });

  it('pressing its button lets the next toast hide on time, even with the finger still there', () => {
    const toast = TestBed.inject(Toast);

    toast.show('Moved', { label: 'Undo', run: () => toast.show('Moved back') });
    toast.hold('pointer', true);
    toast.act();
    vi.advanceTimersByTime(TOAST_MS);

    expect(toast.shown()).toBe(false);
  });

  it('a toast without a button drops the last one', () => {
    const toast = TestBed.inject(Toast);

    toast.show('Moved', { label: 'Undo', run: () => undefined });
    toast.show('Moved back');

    expect(toast.action()).toBeNull();
  });
});
