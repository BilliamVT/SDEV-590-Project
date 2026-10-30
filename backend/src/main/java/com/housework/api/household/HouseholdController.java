package com.housework.api.household;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.household.HouseholdDtos.CreateHouseholdRequest;
import com.housework.api.household.HouseholdDtos.HouseholdResponse;
import com.housework.api.household.HouseholdDtos.JoinHouseholdRequest;

/** The logged-in user's household. Singular path, no IDs: see decision record 0005. */
@RestController
@RequestMapping("/api/household")
class HouseholdController {

	private final HouseholdService households;

	HouseholdController(HouseholdService households) {
		this.households = households;
	}

	@GetMapping
	HouseholdResponse get(@AuthenticationPrincipal Jwt jwt) {
		return households.get(userId(jwt));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	HouseholdResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateHouseholdRequest request) {
		return households.create(userId(jwt), request.name(), request.timeZone());
	}

	@PostMapping("/join")
	HouseholdResponse join(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody JoinHouseholdRequest request) {
		return households.join(userId(jwt), request.inviteCode());
	}

	@PostMapping("/invite-code")
	HouseholdResponse regenerateInviteCode(@AuthenticationPrincipal Jwt jwt) {
		return households.regenerateInviteCode(userId(jwt));
	}

	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
