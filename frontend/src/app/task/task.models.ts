/** Shapes of the backend's /api/tasks requests and responses (backend TaskDtos). */
export type Frequency = 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS' | 'EVERY_N_WEEKS' | 'MONTHLY' | 'QUARTERLY';

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

/** Schedule fields depend on the frequency; the backend builds the recurrence rule from them. */
export interface CreateTaskRequest {
  name: string;
  frequency: Frequency;
  interval?: number;
  /** WEEKLY and EVERY_N_WEEKS: one or more days (BILLIAMVT-50) */
  daysOfWeek?: DayOfWeek[];
  /** 1–28, or -1 for the last day of the month */
  dayOfMonth?: number;
  /** yyyy-mm-dd */
  startsOn?: string;
  estimatedMinutes?: number;
}

export interface Task {
  id: number;
  name: string;
  recurrenceRule: string;
  /** In words, e.g. "Every week on Saturday" or "Every week on Monday and Thursday" */
  schedule: string;
  /** The menu fields the rule was built from, for the edit form */
  frequency: Frequency;
  interval: number | null;
  /** Sunday first */
  daysOfWeek: DayOfWeek[] | null;
  dayOfMonth: number | null;
  startsOn: string;
  estimatedMinutes: number | null;
  active: boolean;
}
