import { TestBed } from '@angular/core/testing';

import { Announcer } from './announcer';

describe('Announcer (BILLIAMVT-49)', () => {
  it('replaces the message, clearing it first so a repeat is read again', async () => {
    const announcer = TestBed.inject(Announcer);
    announcer.announce('Vacuum marked done');
    expect(announcer.message()).toBe('');
    await new Promise((resolve) => setTimeout(resolve));
    expect(announcer.message()).toBe('Vacuum marked done');
  });
});
