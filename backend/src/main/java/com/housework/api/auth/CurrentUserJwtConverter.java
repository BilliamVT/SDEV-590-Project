package com.housework.api.auth;

import java.util.List;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import com.housework.api.user.AppUserRepository;

/**
 * Turns a valid JWT into the request's authentication, after checking the user still
 * exists, so a deleted account stops working immediately (decision record 0004).
 */
@Component
class CurrentUserJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

	private final AppUserRepository users;

	CurrentUserJwtConverter(AppUserRepository users) {
		this.users = users;
	}

	@Override
	public AbstractAuthenticationToken convert(Jwt jwt) {
		long userId;
		try {
			userId = Long.parseLong(jwt.getSubject());
		}
		catch (NumberFormatException ex) {
			throw new InvalidBearerTokenException("Token subject is not a user ID");
		}
		if (!users.existsById(userId)) {
			throw new InvalidBearerTokenException("The account for this token no longer exists");
		}
		return new JwtAuthenticationToken(jwt, List.of(), jwt.getSubject());
	}

}
