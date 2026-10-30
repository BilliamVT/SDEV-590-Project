package com.housework.api.auth;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.auth.AuthDtos.DeleteAccountRequest;
import com.housework.api.auth.AuthDtos.UserResponse;
import com.housework.api.user.AppUserRepository;

/**
 * The logged-in user's own account at /api/me: viewing it, and deleting it
 * (BILLIAMVT-41). Later: changing profile details.
 */
@RestController
class AccountController {

	private final AppUserRepository users;

	private final AccountService accounts;

	AccountController(AppUserRepository users, AccountService accounts) {
		this.users = users;
		this.accounts = accounts;
	}

	@GetMapping("/api/me")
	UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		// CurrentUserJwtConverter has already checked that this user exists
		return users.findById(Long.parseLong(jwt.getSubject()))
			.map(UserResponse::from)
			.orElseThrow();
	}

	@DeleteMapping("/api/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DeleteAccountRequest request) {
		accounts.delete(Long.parseLong(jwt.getSubject()), request.password());
	}

}
