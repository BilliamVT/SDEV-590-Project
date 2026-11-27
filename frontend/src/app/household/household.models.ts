/** Shapes of the backend's /api/household responses (backend HouseholdDtos). */
export interface Member {
  id: number;
  displayName: string;
}

export interface Household {
  id: number;
  name: string;
  timeZone: string;
  /** Uppercase, no separators; shown with formatInviteCode. */
  inviteCode: string;
  members: Member[];
}

/** "Sam Lee" → "Sam": how an assignee is shown on the week (BILLIAMVT-64). */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}
