/** Shapes of the backend's /api/tasks requests and responses (backend TaskDtos). */
import { TaskColor } from './task-colors';

/** QUARTERLY is no longer in the menu: every 3 months is EVERY_N_MONTHS with 3 (BILLIAMVT-60). */
export type Frequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'EVERY_N_DAYS'
  | 'EVERY_N_WEEKS'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'EVERY_N_MONTHS'
  | 'YEARLY';

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
  /** A household member, or null for Anyone (BILLIAMVT-64). Editing always sends it. */
  assigneeId?: number | null;
  /** The task's color, or null for none (BILLIAMVT-65). Editing always sends it. */
  color?: TaskColor | null;
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
  /** The latest day it was done, and by whom (BILLIAMVT-26); null if never done */
  lastDone: LastDone | null;
  /** Who the whole task is assigned to; null for Anyone (BILLIAMVT-64) */
  assigneeId: number | null;
  /** The household's color for it, or null (BILLIAMVT-65) */
  color: TaskColor | null;
}

export interface LastDone {
  date: string;
  /** Null when that member has since deleted their account */
  byName: string | null;
}
