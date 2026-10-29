package com.housework.api.auth;

import java.time.Duration;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * JWT settings (decision record 0004). In production the secret comes from the
 * APP_JWT_SECRET environment variable; startup fails if it's missing or too short.
 */
@Validated
@ConfigurationProperties("app.jwt")
public record JwtProperties(
		/** HMAC-SHA256 signing key; at least 32 characters (256 bits). */
		@NotBlank @Size(min = 32) String secret,
		/** How long an issued token stays valid. */
		@NotNull Duration expiresIn) {
}
