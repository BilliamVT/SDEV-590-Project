package com.housework.api.config;

import java.util.stream.Collectors;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.housework.api.auth.EmailAlreadyRegisteredException;
import com.housework.api.auth.IncorrectPasswordException;
import com.housework.api.household.AlreadyInHouseholdException;
import com.housework.api.household.InvalidTimeZoneException;
import com.housework.api.household.InviteCodeNotFoundException;
import com.housework.api.household.NoHouseholdException;
import com.housework.api.schedule.InvalidRangeException;
import com.housework.api.task.InvalidScheduleException;
import com.housework.api.task.TaskNotFoundException;

/**
 * Turns exceptions into RFC 9457 problem responses: application exceptions here, and Spring's
 * own (validation, unreadable body, unknown path) through ResponseEntityExceptionHandler.
 * Each records a short reason for the request log (BILLIAMVT-44). Reasons never include
 * what the user typed: validation reasons name the fields, not their values.
 */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	@ExceptionHandler(EmailAlreadyRegisteredException.class)
	ProblemDetail emailAlreadyRegistered(EmailAlreadyRegisteredException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.CONFLICT, ex, "email already registered");
	}

	@ExceptionHandler(BadCredentialsException.class)
	ProblemDetail badCredentials(BadCredentialsException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.UNAUTHORIZED, ex, "bad credentials");
	}

	@ExceptionHandler(IncorrectPasswordException.class)
	ProblemDetail incorrectPassword(IncorrectPasswordException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.FORBIDDEN, ex, "incorrect password");
	}

	@ExceptionHandler(NoHouseholdException.class)
	ProblemDetail noHousehold(NoHouseholdException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.NOT_FOUND, ex, "no household");
	}

	@ExceptionHandler(InviteCodeNotFoundException.class)
	ProblemDetail inviteCodeNotFound(InviteCodeNotFoundException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.NOT_FOUND, ex, "invite code not found");
	}

	@ExceptionHandler(AlreadyInHouseholdException.class)
	ProblemDetail alreadyInHousehold(AlreadyInHouseholdException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.CONFLICT, ex, "already in a household");
	}

	@ExceptionHandler(InvalidTimeZoneException.class)
	ProblemDetail invalidTimeZone(InvalidTimeZoneException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.BAD_REQUEST, ex, "invalid time zone");
	}

	@ExceptionHandler(InvalidScheduleException.class)
	ProblemDetail invalidSchedule(InvalidScheduleException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.BAD_REQUEST, ex, "invalid schedule");
	}

	@ExceptionHandler(TaskNotFoundException.class)
	ProblemDetail taskNotFound(TaskNotFoundException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.NOT_FOUND, ex, "task not found");
	}

	@ExceptionHandler(InvalidRangeException.class)
	ProblemDetail invalidRange(InvalidRangeException ex, HttpServletRequest request) {
		return problem(request, HttpStatus.BAD_REQUEST, ex, "invalid range");
	}

	/** Spring's own exceptions; the response body is unchanged, only the reason is added. */
	@Override
	protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
			HttpStatusCode statusCode, WebRequest request) {
		if (request instanceof ServletWebRequest servletRequest) {
			RequestLoggingFilter.recordReason(servletRequest.getRequest(), reason(ex));
		}
		return super.handleExceptionInternal(ex, body, headers, statusCode, request);
	}

	private static String reason(Exception ex) {
		return switch (ex) {
			case MethodArgumentNotValidException invalid -> "invalid fields: " + invalid.getFieldErrors()
				.stream()
				.map(FieldError::getField)
				.distinct()
				.sorted()
				.collect(Collectors.joining(", "));
			case HttpMessageNotReadableException unreadable -> "unreadable request body";
			case NoResourceFoundException missing -> "no such endpoint";
			case HttpRequestMethodNotSupportedException method -> "method not allowed";
			case MissingServletRequestParameterException missing -> "missing parameter: " + missing.getParameterName();
			case TypeMismatchException mismatch -> "invalid parameter: " + mismatch.getPropertyName();
			default -> ex.getClass().getSimpleName();
		};
	}

	private static ProblemDetail problem(HttpServletRequest request, HttpStatus status, Exception ex, String reason) {
		RequestLoggingFilter.recordReason(request, reason);
		return ProblemDetail.forStatusAndDetail(status, ex.getMessage());
	}

}
