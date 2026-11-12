/** A one-off item waiting in the backlog, not yet on a day (BILLIAMVT-23). */
export interface BacklogItem {
  id: number;
  name: string;
  estimatedMinutes: number | null;
}

export interface CreateItemRequest {
  name: string;
  estimatedMinutes?: number;
}
