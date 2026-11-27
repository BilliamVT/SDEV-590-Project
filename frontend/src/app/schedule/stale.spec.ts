import { HttpErrorResponse } from '@angular/common/http';

import { ScheduledOccurrence } from './schedule.models';
import { changedMessage, isStale, removedMessage, wasAlready } from './stale';

const vacuum = (extra: Partial<ScheduledOccurrence> = {}): ScheduledOccurrence => ({
  id: 1,
  taskId: 1,
  taskName: 'Vacuum',
  date: '2026-11-11',
  originalDate: '2026-11-11',
  status: 'PENDING',
  estimatedMinutes: null,
  overdue: false,
  taskDeleted: false,
  completedByName: null,
  completedById: null,
  completedAt: null,
  oneOff: false,
  assigneeId: null,
  assigneeName: null,
  assignmentSet: false,
  color: null,
  ...extra,
});

describe('stale notices (BILLIAMVT-55, decision record 0007)', () => {
  const ME = 1;

  it('names another member only when the day records who did it', () => {
    expect(
      changedMessage(vacuum({ status: 'DONE', completedById: 2, completedByName: 'Sam' }), ME),
    ).toBe('Sam already marked Vacuum done. Your week is up to date.');
    expect(
      changedMessage(vacuum({ status: 'SKIPPED', completedById: 2, completedByName: 'Sam' }), ME),
    ).toBe('Sam already skipped Vacuum. Your week is up to date.');
  });

  it('says "You" for this account, even when another member has the same name', () => {
    expect(
      changedMessage(vacuum({ status: 'DONE', completedById: ME, completedByName: 'Pat' }), ME),
    ).toBe('You already marked Vacuum done. Your week is up to date.');
    expect(
      changedMessage(vacuum({ status: 'DONE', completedById: 3, completedByName: 'Pat' }), ME),
    ).toBe('Pat already marked Vacuum done. Your week is up to date.');
  });

  it("stays neutral when the member's account was deleted", () => {
    expect(changedMessage(vacuum({ status: 'DONE' }), ME)).toBe(
      'Vacuum was already marked done. Your week is up to date.',
    );
    expect(changedMessage(vacuum({ status: 'SKIPPED' }), ME)).toBe(
      'Vacuum was already skipped. Your week is up to date.',
    );
  });

  it("stays neutral for changes that don't record who made them", () => {
    expect(changedMessage(vacuum({ date: '2026-11-13' }), ME)).toBe(
      "Your week has changed since it was loaded, so it's been updated.",
    );
    expect(changedMessage(undefined, ME)).toBe(
      "Your week has changed since it was loaded, so it's been updated.",
    );
    expect(removedMessage('Vacuum')).toBe('Vacuum was already removed. Your week is up to date.');
  });

  it('spots a done or skip that someone else got to first', () => {
    expect(wasAlready(vacuum({ status: 'DONE', completedById: 2 }), 'DONE', ME)).toBe(true);
    expect(wasAlready(vacuum({ status: 'DONE', completedById: null }), 'DONE', ME)).toBe(true);
    expect(wasAlready(vacuum({ status: 'DONE', completedById: ME }), 'DONE', ME)).toBe(false);
    expect(wasAlready(vacuum(), 'PENDING', ME)).toBe(false);
    const fromAnOlderBackend = {
      ...vacuum({ status: 'DONE' }),
      completedById: undefined,
    } as unknown as ScheduledOccurrence;
    expect(wasAlready(fromAnOlderBackend, 'DONE', ME)).toBe(false);
  });

  it('treats 404 and 409 as stale, other errors not', () => {
    expect(isStale(new HttpErrorResponse({ status: 404 }))).toBe(true);
    expect(isStale(new HttpErrorResponse({ status: 409 }))).toBe(true);
    expect(isStale(new HttpErrorResponse({ status: 500 }))).toBe(false);
    expect(isStale(new Error('offline'))).toBe(false);
  });
});
