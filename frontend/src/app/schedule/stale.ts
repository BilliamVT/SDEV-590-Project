import { HttpErrorResponse } from '@angular/common/http';

import { ScheduledOccurrence } from './schedule.models';

/**
 * Notices for an action on something that had already changed, e.g. on another member's phone
 * (BILLIAMVT-55, decision record 0007). They say what happened and that the week was updated,
 * without guessing why. A person is named only when the app knows for certain who made the change:
 * marking done or skipped records who did it; deleting, moving and renaming don't.
 */
const UP_TO_DATE = 'Your week is up to date.';

/** The action failed because its day changed (409) or no longer exists (404). */
export function isStale(err: unknown): err is HttpErrorResponse {
  return err instanceof HttpErrorResponse && (err.status === 404 || err.status === 409);
}

/** The day, or the task it belonged to, no longer exists. */
export function removedMessage(taskName: string): string {
  return `${taskName} was already removed. ${UP_TO_DATE}`;
}

/**
 * The day as it is now, after reloading. Done or skipped: who did it, if known for certain;
 * "You" when it was this account (e.g. on another device). Otherwise a neutral notice.
 */
export function changedMessage(
  current: ScheduledOccurrence | undefined,
  myId: number | null,
): string {
  if (current && (current.status === 'DONE' || current.status === 'SKIPPED')) {
    const task = current.taskName;
    const did = current.status === 'DONE' ? `marked ${task} done` : `skipped ${task}`;
    if (current.completedById !== null && current.completedById === myId) {
      return `You already ${did}. ${UP_TO_DATE}`;
    }
    if (current.completedById !== null && current.completedByName) {
      return `${current.completedByName} already ${did}. ${UP_TO_DATE}`;
    }
    const was =
      current.status === 'DONE' ? `${task} was already marked done` : `${task} was already skipped`;
    return `${was}. ${UP_TO_DATE}`;
  }
  return "Your week has changed since it was loaded, so it's been updated.";
}

/**
 * Marking a day done or skipped that someone else already had: the server keeps the first record
 * (BILLIAMVT-25), so the reply still has the status asked for, but someone else's name on it.
 */
export function wasAlready(
  updated: ScheduledOccurrence,
  requested: string,
  myId: number | null,
): boolean {
  // A backend without completedById (e.g. mid-deploy) can't tell, so it's never "already"
  return (
    requested !== 'PENDING' &&
    updated.status === requested &&
    updated.completedById !== undefined &&
    updated.completedById !== myId
  );
}
