package com.housework.api.config;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.housework.api.auth.EmailAlreadyRegisteredException;
import com.housework.api.auth.IncorrectPasswordException;
import com.housework.api.household.AlreadyInHouseholdException;
import com.housework.api.household.InvalidTimeZoneException;
import com.housework.api.household.InviteCodeNotFoundException;
import com.housework.api.household.NoHouseholdException;

/**
 * Turns application exceptions into RFC 9457 problem responses. Validation errors (400)
 * are handled by Spring itself (spring.mvc.problemdetails.enabled).
 */
@RestControllerAdvice
class ApiExceptionHandler {

	@ExceptionHandler(EmailAlreadyRegisteredException.class)
	ProblemDetail emailAlreadyRegistered(EmailAlreadyRegisteredException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
	}

	@ExceptionHandler(BadCredentialsException.class)
	ProblemDetail badCredentials(BadCredentialsException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, ex.getMessage());
	}

	@ExceptionHandler(IncorrectPasswordException.class)
	ProblemDetail incorrectPassword(IncorrectPasswordException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, ex.getMessage());
	}

	@ExceptionHandler({ NoHouseholdException.class, InviteCodeNotFoundException.class })
	ProblemDetail notFound(RuntimeException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
	}

	@ExceptionHandler(AlreadyInHouseholdException.class)
	ProblemDetail alreadyInHousehold(AlreadyInHouseholdException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
	}

	@ExceptionHandler(InvalidTimeZoneException.class)
	ProblemDetail invalidTimeZone(InvalidTimeZoneException ex) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
	}

}
