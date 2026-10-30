package com.housework.api.household;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.housework.api.user.AppUser;

/** Request and response bodies for /api/household. */
public final class HouseholdDtos {

	private HouseholdDtos() {
	}

	public record CreateHouseholdRequest(@NotBlank @Size(max = 100) String name, @NotBlank @Size(max = 64) String timeZone) {
	}

	/** Household settings (BILLIAMVT-46). Later options become more fields here. */
	public record UpdateHouseholdRequest(@NotBlank @Size(max = 100) String name) {
	}

	public record JoinHouseholdRequest(@NotBlank @Size(max = 32) String inviteCode) {
	}

	/** Members are shown by display name only: other members don't need each other's emails. */
	public record MemberResponse(Long id, String displayName) {

		static MemberResponse from(AppUser user) {
			return new MemberResponse(user.getId(), user.getDisplayName());
		}

	}

	public record HouseholdResponse(Long id, String name, String timeZone, String inviteCode,
			List<MemberResponse> members) {

		static HouseholdResponse from(Household household, List<AppUser> members) {
			return new HouseholdResponse(household.getId(), household.getName(), household.getTimeZone(),
					household.getInviteCode(), members.stream().map(MemberResponse::from).toList());
		}

	}

}
