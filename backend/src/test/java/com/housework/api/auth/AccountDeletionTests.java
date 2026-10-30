package com.housework.api.auth;

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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;
import com.housework.api.user.AppUserRepository;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
@ExtendWith(OutputCaptureExtension.class)
class AccountDeletionTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private AppUserRepository users;

	@Autowired
	private JdbcClient jdbc;

	@Test
	void deletingTheAccountEndsTheSessionAndTheLogin() {
		String token = registerWithHousehold("pat@example.com", "Pat");

		assertThat(delete(token, "correct-horse")).hasStatus(204);

		assertThat(users.findByEmail("pat@example.com")).isEmpty();
		assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).hasStatus(401);
		assertThat(login("pat@example.com", "correct-horse")).hasStatus(401);
	}

	@Test
	void aWrongPasswordDeletesNothing() {
		String token = registerWithHousehold("pat@example.com", "Pat");

		MvcTestResult result = delete(token, "wrong-password");

		assertThat(result).hasStatus(403);
		assertThat(body(result)).contains("Password is incorrect");
		assertThat(users.findByEmail("pat@example.com")).isPresent();
		assertThat(mvc.get().uri("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).hasStatusOk();
	}

	@Test
	void theLastMemberTakesTheHouseholdAndItsTasksWithThem() {
		String token = registerWithHousehold("pat@example.com", "Pat");
		long householdId = householdIdOf("pat@example.com");
		long taskId = insertTask(householdId);
		insertOccurrence(taskId, null);

		assertThat(delete(token, "correct-horse")).hasStatus(204);

		assertThat(count("select count(*) from household where id = ?", householdId)).isZero();
		assertThat(count("select count(*) from task where household_id = ?", householdId)).isZero();
		assertThat(count("select count(*) from occurrence where task_id = ?", taskId)).isZero();
	}

	@Test
	void otherMembersKeepTheHouseholdAndItsHistory() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = register("blair@example.com", "Blair");
		join(blair, inviteCode(alex));
		long householdId = householdIdOf("alex@example.com");
		Long blairId = users.findByEmail("blair@example.com").orElseThrow().getId();
		long taskId = insertTask(householdId);
		long occurrenceId = insertOccurrence(taskId, blairId);

		assertThat(delete(blair, "correct-horse")).hasStatus(204);

		assertThat(count("select count(*) from household where id = ?", householdId)).isOne();
		MvcTestResult household = mvc.get().uri("/api/household").header(HttpHeaders.AUTHORIZATION, "Bearer " + alex).exchange();
		assertThat(body(household)).contains("Alex").doesNotContain("Blair");
		// The completion is kept, but no longer linked to the deleted user
		assertThat(jdbc.sql("select status from occurrence where id = ?").param(occurrenceId).query(String.class).single())
			.isEqualTo("DONE");
		assertThat(count("select count(*) from occurrence where id = ? and completed_by is null", occurrenceId)).isOne();
	}

	@Test
	void deletionRequiresThePassword() {
		String token = registerWithHousehold("pat@example.com", "Pat");

		assertThat(mvc.delete()
			.uri("/api/me")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).hasStatus(400);
		assertThat(users.findByEmail("pat@example.com")).isPresent();
	}

	@Test
	void logsTheDeletionWithoutPersonalData(CapturedOutput output) {
		String token = registerWithHousehold("logs@example.com", "Logan");
		Long id = users.findByEmail("logs@example.com").orElseThrow().getId();
		long householdId = householdIdOf("logs@example.com");

		delete(token, "wrong-password");
		delete(token, "correct-horse");

		assertThat(output).contains("Account deletion rejected for user " + id)
			.contains("Deleted user " + id)
			.contains("Deleted household " + householdId + ": no members left")
			.doesNotContain("logs@example.com")
			.doesNotContain("correct-horse")
			.doesNotContain("wrong-password");
	}

	private long insertTask(long householdId) {
		return jdbc.sql("insert into task (household_id, name, recurrence_rule, starts_on)"
				+ " values (?, 'Vacuum', 'FREQ=WEEKLY;BYDAY=SA', date '2026-11-01') returning id")
			.param(householdId)
			.query(Long.class)
			.single();
	}

	private long insertOccurrence(long taskId, Long completedBy) {
		return jdbc.sql("insert into occurrence (task_id, original_date, scheduled_date, status, completed_by, completed_at)"
				+ " values (?, date '2026-11-07', date '2026-11-07', 'DONE', ?, now()) returning id")
			.param(taskId)
			.param(completedBy)
			.query(Long.class)
			.single();
	}

	private long count(String sql, long id) {
		return jdbc.sql(sql).param(id).query(Long.class).single();
	}

	private long householdIdOf(String email) {
		return users.findByEmail(email).orElseThrow().getHouseholdId();
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

	private String registerWithHousehold(String email, String displayName) {
		String token = register(email, displayName);
		mvc.post()
			.uri("/api/household")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"%s's household\", \"timeZone\": \"America/New_York\"}".formatted(displayName))
			.exchange();
		return token;
	}

	private String inviteCode(String token) {
		MvcTestResult result = mvc.get().uri("/api/household").header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
		return JsonPath.read(body(result), "$.inviteCode");
	}

	private void join(String token, String inviteCode) {
		mvc.post()
			.uri("/api/household/join")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"inviteCode\": \"%s\"}".formatted(inviteCode))
			.exchange();
	}

	private MvcTestResult delete(String token, String password) {
		return mvc.delete()
			.uri("/api/me")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\": \"%s\"}".formatted(password))
			.exchange();
	}

	private MvcTestResult login(String email, String password) {
		return mvc.post()
			.uri("/api/auth/login")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"%s\"}".formatted(email, password))
			.exchange();
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
