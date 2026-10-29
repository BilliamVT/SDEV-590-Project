package com.housework.api.auth;

import java.time.Instant;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import com.housework.api.user.AppUser;

/** Request and response bodies for /api/auth and /api/me. */
public final class AuthDtos {

	private AuthDtos() {
	}

	public record RegisterRequest(
			@NotBlank @Email @Size(max = 254) String email,
			// BCrypt only uses the first 72 bytes of a password
			@NotBlank @Size(min = 8, max = 72) String password,
			@NotBlank @Size(max = 100) String displayName) {
	}

	public record LoginRequest(@NotBlank String email, @NotBlank String password) {
	}

	public record UserResponse(Long id, String email, String displayName) {

		static UserResponse from(AppUser user) {
			return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName());
		}

	}

	public record AuthResponse(String token, Instant expiresAt, UserResponse user) {
	}

}
