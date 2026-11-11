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
  /** Pending on a day before the household's today */
  overdue: boolean;
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
