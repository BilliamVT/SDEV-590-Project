package com.housework.api.auth;

import java.util.Locale;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.auth.AuthDtos.AuthResponse;
import com.housework.api.auth.AuthDtos.LoginRequest;
import com.housework.api.auth.AuthDtos.RegisterRequest;
import com.housework.api.auth.AuthDtos.UserResponse;
import com.housework.api.auth.TokenService.IssuedToken;
import com.housework.api.user.AppUser;
import com.housework.api.user.AppUserRepository;

/**
 * Registration and login. Logs account events by user ID only: never emails,
 * passwords or tokens (personal data and secrets would stay in the logs).
 */
@Service
public class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);

	private final AppUserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final TokenService tokens;

	/** Compared against when no account matches, so a wrong email takes as long as a wrong password. */
	private final String unknownUserHash;

	AuthService(AppUserRepository users, PasswordEncoder passwordEncoder, TokenService tokens) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.tokens = tokens;
		this.unknownUserHash = passwordEncoder.encode("no-account-placeholder");
	}

	@Transactional
	public AuthResponse register(RegisterRequest request) {
		String email = normalize(request.email());
		if (users.existsByEmail(email)) {
			log.info("Registration rejected: email already registered");
			throw new EmailAlreadyRegisteredException();
		}
		AppUser user = new AppUser(email, request.displayName().strip(), passwordEncoder.encode(request.password()));
		try {
			user = users.saveAndFlush(user);
		}
		catch (DataIntegrityViolationException ex) {
			// Another request registered the same email in the meantime
			log.info("Registration rejected: email already registered");
			throw new EmailAlreadyRegisteredException();
		}
		log.info("Registered user {}", user.getId());
		return authResponse(user);
	}

	@Transactional(readOnly = true)
	public AuthResponse login(LoginRequest request) {
		Optional<AppUser> user = users.findByEmail(normalize(request.email()));
		String hash = user.map(AppUser::getPasswordHash).orElse(unknownUserHash);
		boolean passwordMatches = passwordEncoder.matches(request.password(), hash);
		if (user.isEmpty() || !passwordMatches) {
			// Same error either way, so the API doesn't reveal which emails have accounts.
			// No email in the log: it's personal data, and people sometimes type a password there.
			log.warn("Failed login attempt");
			throw new BadCredentialsException("Invalid email or password");
		}
		log.info("User {} logged in", user.get().getId());
		return authResponse(user.get());
	}

	private AuthResponse authResponse(AppUser user) {
		IssuedToken token = tokens.issueFor(user);
		return new AuthResponse(token.value(), token.expiresAt(), UserResponse.from(user));
	}

	/** Emails are stored lowercase (V1 schema, BILLIAMVT-20 note). */
	static String normalize(String email) {
		return email.strip().toLowerCase(Locale.ROOT);
	}

}
