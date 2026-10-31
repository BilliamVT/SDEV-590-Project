package com.housework.api.config;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Logs one line per request, e.g. "GET /api/household 200 12 ms" (BILLIAMVT-44). Runs before
 * Spring Security so rejected requests (401) are logged too. Errors get a short reason, e.g.
 * "POST /api/household/join 404 15 ms (invite code not found)", recorded by ApiExceptionHandler.
 *
 * Only the method, path, status, duration and reason: no query strings, headers, tokens or
 * bodies, which could hold personal data. Health checks and CORS preflights are skipped so
 * they don't flood the logs.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestLoggingFilter extends OncePerRequestFilter {

	private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

	private static final String REASON = RequestLoggingFilter.class.getName() + ".reason";

	/** Called by error handlers; must never contain user input. */
	static void recordReason(HttpServletRequest request, String reason) {
		request.setAttribute(REASON, reason);
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return request.getRequestURI().startsWith("/actuator/health") || "OPTIONS".equals(request.getMethod());
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		long start = System.nanoTime();
		String failure = null;
		try {
			chain.doFilter(request, response);
		}
		catch (ServletException | IOException | RuntimeException ex) {
			failure = ex.getClass().getSimpleName();
			throw ex;
		}
		finally {
			// An exception that escapes the chain becomes a 500 after this filter has returned;
			// Spring logs its stack trace
			int status = failure != null ? HttpServletResponse.SC_INTERNAL_SERVER_ERROR : response.getStatus();
			String reason = failure != null ? failure : reason(request, response, status);
			long millis = (System.nanoTime() - start) / 1_000_000;
			if (reason == null) {
				log.info("{} {} {} {} ms", request.getMethod(), request.getRequestURI(), status, millis);
			}
			else {
				log.info("{} {} {} {} ms ({})", request.getMethod(), request.getRequestURI(), status, millis, reason);
			}
		}
	}

	private static String reason(HttpServletRequest request, HttpServletResponse response, int status) {
		if (request.getAttribute(REASON) instanceof String reason) {
			return reason;
		}
		// Spring Security answers 401 itself; its header says whether a token was sent
		if (status == HttpServletResponse.SC_UNAUTHORIZED) {
			String challenge = response.getHeader(HttpHeaders.WWW_AUTHENTICATE);
			return challenge != null && challenge.contains("invalid_token") ? "invalid or expired token" : "no token";
		}
		return null;
	}

}
