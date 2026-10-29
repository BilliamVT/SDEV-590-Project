package com.housework.api.auth;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;
import com.housework.api.user.AppUser;
import com.housework.api.user.AppUserRepository;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class AuthTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private AppUserRepository users;

	@Autowired
	private JwtEncoder encoder;

	@Test
	void registerCreatesAccountAndReturnsToken() {
		MvcTestResult result = register("Pat@Example.com", "correct-horse", "Pat");

		assertThat(result).hasStatus(201);
		assertThat(result).bodyJson().extractingPath("$.token").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.user.email").isEqualTo("pat@example.com");
		assertThat(result).bodyJson().extractingPath("$.user.displayName").isEqualTo("Pat");
	}

	@Test
	void passwordIsStoredHashed() {
		register("hash@example.com", "correct-horse", "Hash");

		AppUser user = users.findByEmail("hash@example.com").orElseThrow();
		assertThat(user.getPasswordHash()).startsWith("{bcrypt}").doesNotContain("correct-horse");
	}

	@Test
	void registerRejectsAnEmailThatExistsInAnyCase() {
		register("dup@example.com", "correct-horse", "First");

		assertThat(register("DUP@example.com", "another-pass", "Second")).hasStatus(409);
	}

	@Test
	void registerRejectsInvalidInput() {
		assertThat(register("not-an-email", "correct-horse", "Pat")).hasStatus(400);
		assertThat(register("short@example.com", "short", "Pat")).hasStatus(400);
		assertThat(register("noname@example.com", "correct-horse", " ")).hasStatus(400);
	}

	@Test
	void loginWithCorrectPasswordReturnsToken() {
		register("login@example.com", "correct-horse", "Lee");

		MvcTestResult result = login("LOGIN@example.com", "correct-horse");

		assertThat(result).hasStatusOk();
		assertThat(result).bodyJson().extractingPath("$.token").asString().isNotBlank();
	}

	@Test
	void loginFailuresLookTheSameForWrongPasswordAndUnknownEmail() {
		register("known@example.com", "correct-horse", "Kim");

		MvcTestResult wrongPassword = login("known@example.com", "wrong-password");
		MvcTestResult unknownEmail = login("nobody@example.com", "correct-horse");

		assertThat(wrongPassword).hasStatus(401);
		assertThat(unknownEmail).hasStatus(401);
		assertThat(wrongPassword).bodyJson().extractingPath("$.detail").isEqualTo("Invalid email or password");
		assertThat(unknownEmail).bodyJson().extractingPath("$.detail").isEqualTo("Invalid email or password");
	}

	@Test
	void protectedEndpointRejectsRequestsWithoutAToken() {
		assertThat(mvc.get().uri("/api/me")).hasStatus(401);
	}

	@Test
	void protectedEndpointAcceptsAValidToken() {
		String token = tokenFrom(register("me@example.com", "correct-horse", "Morgan"));

		MvcTestResult result = mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();

		assertThat(result).hasStatusOk();
		assertThat(result).bodyJson().extractingPath("$.email").isEqualTo("me@example.com");
	}

	@Test
	void protectedEndpointRejectsATamperedToken() {
		String token = tokenFrom(register("tamper@example.com", "correct-horse", "Toni"));
		String tampered = token.substring(0, token.length() - 4) + "AAAA";

		assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + tampered)).hasStatus(401);
	}

	@Test
	void protectedEndpointRejectsAnExpiredToken() {
		register("expired@example.com", "correct-horse", "Eli");
		AppUser user = users.findByEmail("expired@example.com").orElseThrow();
		String expired = signedToken(user.getId(), Instant.now().minus(Duration.ofDays(31)),
				Instant.now().minus(Duration.ofDays(1)));

		assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + expired)).hasStatus(401);
	}

	@Test
	void tokenStopsWorkingOnceTheAccountIsDeleted() {
		String token = tokenFrom(register("gone@example.com", "correct-horse", "Gale"));
		users.delete(users.findByEmail("gone@example.com").orElseThrow());
		users.flush();

		assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).hasStatus(401);
	}

	@Test
	void logsAccountEventsWithoutPersonalDataOrSecrets(CapturedOutput output) {
		String token = tokenFrom(register("logs@example.com", "correct-horse", "Logan"));
		Long id = users.findByEmail("logs@example.com").orElseThrow().getId();
		login("logs@example.com", "correct-horse");
		login("logs@example.com", "wrong-password");
		register("logs@example.com", "correct-horse", "Logan again");

		assertThat(output).contains("Registered user " + id)
			.contains("User " + id + " logged in")
			.contains("Failed login attempt")
			.contains("Registration rejected: email already registered")
			.doesNotContain("logs@example.com")
			.doesNotContain("correct-horse")
			.doesNotContain("wrong-password")
			.doesNotContain(token);
	}

	@Test
	void healthStaysPublic() {
		assertThat(mvc.get().uri("/actuator/health")).hasStatusOk();
	}

	private MvcTestResult register(String email, String password, String displayName) {
		return mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "%s", "password": "%s", "displayName": "%s"}
					""".formatted(email, password, displayName))
			.exchange();
	}

	private MvcTestResult login(String email, String password) {
		return mvc.post()
			.uri("/api/auth/login")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "%s", "password": "%s"}
					""".formatted(email, password))
			.exchange();
	}

	private static String tokenFrom(MvcTestResult result) {
		try {
			return JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.token");
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private String signedToken(Long userId, Instant issuedAt, Instant expiresAt) {
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(TokenService.ISSUER)
			.subject(userId.toString())
			.issuedAt(issuedAt)
			.expiresAt(expiresAt)
			.build();
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
			.getTokenValue();
	}

}
