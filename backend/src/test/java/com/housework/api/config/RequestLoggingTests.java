package com.housework.api.config;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class RequestLoggingTests {

	@Autowired
	private MockMvcTester mvc;

	@Test
	void logsMethodPathStatusAndDuration(CapturedOutput output) {
		mvc.get().uri("/api/household").exchange();

		assertThat(output).containsPattern("RequestLoggingFilter\\s+: GET /api/household 401 \\d+ ms");
	}

	@Test
	void logsEachRequestOnce(CapturedOutput output) {
		mvc.get().uri("/api/me").exchange();

		assertThat(output.getOut().split("GET /api/me ", -1)).hasSize(2);
	}

	@Test
	void leavesOutQueryStringsTokensAndBodies(CapturedOutput output) {
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "quiet@example.com", "password": "correct-horse", "displayName": "Quinn"}
					""")
			.exchange();
		String token = JsonPath.read(body(registered), "$.token");
		mvc.get().uri("/api/me?email=quiet@example.com").header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();

		assertThat(output).contains("POST /api/auth/register 201")
			.contains("GET /api/me 200")
			.doesNotContain("quiet@example.com")
			.doesNotContain("correct-horse")
			.doesNotContain(token);
	}

	@Test
	void successfulRequestsHaveNoReason(CapturedOutput output) {
		register("ok@example.com", "Olive");

		assertThat(output).containsPattern("POST /api/auth/register 201 \\d+ ms\\R");
	}

	@Test
	void unauthorizedRequestsSayWhetherATokenWasSent(CapturedOutput output) {
		mvc.get().uri("/api/household").exchange();
		mvc.get().uri("/api/household").header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt").exchange();

		assertThat(output).containsPattern("GET /api/household 401 \\d+ ms \\(no token\\)")
			.containsPattern("GET /api/household 401 \\d+ ms \\(invalid or expired token\\)");
	}

	@Test
	void validationErrorsNameTheFieldsButNotTheValues(CapturedOutput output) {
		mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "typed-by-user", "password": "tiny", "displayName": "Val"}
					""")
			.exchange();

		assertThat(output).containsPattern("POST /api/auth/register 400 \\d+ ms \\(invalid fields: email, password\\)")
			.doesNotContain("typed-by-user")
			.doesNotContain("tiny");
	}

	@Test
	void applicationErrorsHaveAShortReason(CapturedOutput output) {
		String token = register("reason@example.com", "Rae");
		mvc.post()
			.uri("/api/household/join")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"inviteCode\": \"ZZZZ-ZZZZ\"}")
			.exchange();
		mvc.post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\": ").exchange();
		mvc.get().uri("/api/tasks").header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();

		assertThat(output).containsPattern("POST /api/household/join 404 \\d+ ms \\(invite code not found\\)")
			.containsPattern("POST /api/auth/login 400 \\d+ ms \\(unreadable request body\\)")
			.containsPattern("GET /api/tasks 404 \\d+ ms \\(no such endpoint\\)")
			.doesNotContain("ZZZZ");
	}

	@Test
	void skipsHealthChecksAndPreflights(CapturedOutput output) {
		mvc.get().uri("/actuator/health").exchange();
		mvc.options()
			.uri("/api/household")
			.header(HttpHeaders.ORIGIN, "https://billiamvt.github.io")
			.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
			.exchange();

		assertThat(output).doesNotContain("RequestLoggingFilter");
	}

	private String register(String email, String displayName) {
		MvcTestResult result = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "%s", "password": "correct-horse", "displayName": "%s"}
					""".formatted(email, displayName))
			.exchange();
		return JsonPath.read(body(result), "$.token");
	}

	private static String body(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
