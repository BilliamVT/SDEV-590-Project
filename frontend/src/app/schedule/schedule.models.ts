import { TaskColor } from '../task/task-colors';

/** Shapes of the backend's /api/schedule response (backend ScheduleDtos). Dates are yyyy-mm-dd. */
export type OccurrenceStatus = 'PENDING' | 'DONE' | 'SKIPPED';

export interface ScheduledOccurrence {
  id: number;
  taskId: number;
  taskName: string;
  date: string;
  originalDate: string;
  status: OccurrenceStatus;
  estimatedMinutes: number | null;
  /** Pending on a day before the household's today (never for deleted tasks) */
  overdue: boolean;
  /** The task was deleted; its past occurrences stay as history (BILLIAMVT-22) */
  taskDeleted: boolean;
  /** Who marked it done or skipped, and when (ISO instant); null while pending (BILLIAMVT-25) */
  completedByName: string | null;
  /** That member's id, to tell "you" from another member with the same name; null if their account was deleted (BILLIAMVT-55) */
  completedById: number | null;
  completedAt: string | null;
  /** A backlog item's day: deleting it can put the item back in the backlog (BILLIAMVT-23). */
  oneOff: boolean;
  /** Who it's assigned to: the day's own assignee, or else the task's; null for Anyone (BILLIAMVT-64) */
  assigneeId: number | null;
  assigneeName: string | null;
  /** The day has its own assignee (Anyone included) instead of following its task's (BILLIAMVT-64) */
  assignmentSet: boolean;
  /** The task's color, or null (BILLIAMVT-65) */
  color: TaskColor | null;
}

export interface Schedule {
  from: string;
  to: string;
  /** The household's today (its time zone), not the browser's */
  today: string;
  /** The schedule can't be viewed past this date */
  lastViewableDate: string;
  occurrences: ScheduledOccurrence[];
}
