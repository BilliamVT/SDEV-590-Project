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
