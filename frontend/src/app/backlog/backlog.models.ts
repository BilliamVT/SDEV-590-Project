import { TaskColor } from '../task/task-colors';

/** A one-off item waiting in the backlog, not yet on a day (BILLIAMVT-23). */
export interface BacklogItem {
  id: number;
  name: string;
  estimatedMinutes: number | null;
  /** Who it's for, null for Anyone; its day follows it once scheduled (BILLIAMVT-64) */
  assigneeId: number | null;
  /** The item's color, or null (BILLIAMVT-65) */
  color: TaskColor | null;
}

export interface CreateItemRequest {
  name: string;
  estimatedMinutes?: number;
  /** Straight onto this day instead of the backlog (BILLIAMVT-59) */
  date?: string;
  /** A household member (BILLIAMVT-64); left out for Anyone */
  assigneeId?: number;
  /** Left out for none (BILLIAMVT-65) */
  color?: TaskColor;
}
