package com.housework.api.auth;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.auth.AuthDtos.UserResponse;
import com.housework.api.user.AppUserRepository;

/**
 * The logged-in user's own account at /api/me: viewing it now; later changing
 * profile details and deleting the account (BILLIAMVT-41).
 */
@RestController
class AccountController {

	private final AppUserRepository users;

	AccountController(AppUserRepository users) {
		this.users = users;
	}

	@GetMapping("/api/me")
	UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		// CurrentUserJwtConverter has already checked that this user exists
		return users.findById(Long.parseLong(jwt.getSubject()))
			.map(UserResponse::from)
			.orElseThrow();
	}

}
