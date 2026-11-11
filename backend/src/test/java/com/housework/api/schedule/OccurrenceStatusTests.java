package com.housework.api.schedule;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;

import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/** Marking occurrences done or skipped, and undoing it (BILLIAMVT-25). */
@IntegrationTest
@Transactional
class OccurrenceStatusTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void doneRecordsWhoAndWhenAndShowsInTheSchedule() {
		String token = registerWithHousehold("pat@example.com");
		long id = occurrenceId(createDailyTask(token), today);

		MvcTestResult result = changeStatus(token, id, "DONE");

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<String>read(body(result), "$.status")).isEqualTo("DONE");
		assertThat(JsonPath.<String>read(body(result), "$.completedByName")).isEqualTo("Pat");
		assertThat(JsonPath.<String>read(body(result), "$.completedAt")).isNotNull();
		String schedule = body(schedule(token, today, today));
		assertThat(JsonPath.<String>read(schedule, "$.occurrences[0].status")).isEqualTo("DONE");
		assertThat(JsonPath.<String>read(schedule, "$.occurrences[0].completedByName")).isEqualTo("Pat");
	}

	@Test
	void skippingRecordsWhoAndUndoingClearsIt() {
		String token = registerWithHousehold("pat@example.com");
		long id = occurrenceId(createDailyTask(token), today);

		MvcTestResult skipped = changeStatus(token, id, "SKIPPED");
		assertThat(JsonPath.<String>read(body(skipped), "$.status")).isEqualTo("SKIPPED");
		assertThat(JsonPath.<String>read(body(skipped), "$.completedByName")).isEqualTo("Pat");

		MvcTestResult undone = changeStatus(token, id, "PENDING");
		assertThat(undone).hasStatusOk();
		assertThat(JsonPath.<String>read(body(undone), "$.status")).isEqualTo("PENDING");
		assertThat(JsonPath.<String>read(body(undone), "$.completedByName")).isNull();
		assertThat(JsonPath.<String>read(body(undone), "$.completedAt")).isNull();
	}

	@Test
	void anOverdueOccurrenceMarkedDoneIsNoLongerOverdue() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		backdate(taskId, today.minusDays(2));
		schedule(token, today.minusDays(2), today);
		long id = occurrenceId(taskId, today.minusDays(1));

		assertThat(JsonPath.<Boolean>read(body(changeStatus(token, id, "PENDING")), "$.overdue")).isTrue();
		assertThat(JsonPath.<Boolean>read(body(changeStatus(token, id, "DONE")), "$.overdue")).isFalse();
	}

	@Test
	void theSameStatusAgainKeepsTheFirstRecord() {
		String token = registerWithHousehold("pat@example.com");
		long id = occurrenceId(createDailyTask(token), today);

		String first = JsonPath.read(body(changeStatus(token, id, "DONE")), "$.completedAt");
		String second = JsonPath.read(body(changeStatus(token, id, "DONE")), "$.completedAt");

		assertThat(second).isEqualTo(first);
	}

	@Test
	void aDeletedTasksOccurrencesCanStillBeChanged() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today);
		changeStatus(token, id, "DONE");
		assertThat(mvc.delete().uri("/api/tasks/{id}", taskId).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
			.hasStatus(204);

		MvcTestResult result = changeStatus(token, id, "SKIPPED");

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<String>read(body(result), "$.status")).isEqualTo("SKIPPED");
		assertThat(JsonPath.<Boolean>read(body(result), "$.taskDeleted")).isTrue();
	}

	@Test
	void otherHouseholdsAndUnknownOccurrencesGet404() {
		String alex = registerWithHousehold("alex@example.com");
		String blair = registerWithHousehold("blair@example.com");
		long id = occurrenceId(createDailyTask(alex), today);

		assertThat(changeStatus(blair, id, "DONE")).hasStatus(404);
		assertThat(changeStatus(alex, Long.MAX_VALUE, "DONE")).hasStatus(404);
		assertThat(JsonPath.<String>read(body(schedule(alex, today, today)), "$.occurrences[0].status"))
			.isEqualTo("PENDING");
	}

	@Test
	void theStatusMustBeValidAndALoginIsNeeded() {
		String token = registerWithHousehold("pat@example.com");
		long id = occurrenceId(createDailyTask(token), today);

		assertThat(changeStatus(token, id, "FINISHED")).hasStatus(400);
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/status", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).hasStatus(400);
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/status", id)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\": \"DONE\"}")).hasStatus(401);
	}

	private MvcTestResult changeStatus(String token, long id, String status) {
		MvcTestResult result = mvc.put()
			.uri("/api/occurrences/{id}/status", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\": \"%s\"}".formatted(status))
			.exchange();
		entityManager.clear();
		return result;
	}

	/** Makes a task look created on {@code startsOn} and not yet generated (start dates can't be in the past). */
	private void backdate(long taskId, LocalDate startsOn) {
		jdbc.sql("delete from occurrence where task_id = ?").param(taskId).update();
		jdbc.sql("update task set starts_on = ?, generated_through = null where id = ?").params(startsOn, taskId).update();
		entityManager.clear();
	}

	private long occurrenceId(long taskId, LocalDate originalDate) {
		entityManager.flush();
		return jdbc.sql("select id from occurrence where task_id = ? and original_date = ?")
			.params(taskId, originalDate)
			.query(Long.class)
			.single();
	}

	private String register(String email) {
		MvcTestResult result = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"correct-horse\", \"displayName\": \"Pat\"}".formatted(email))
			.exchange();
		return JsonPath.read(body(result), "$.token");
	}

	private String registerWithHousehold(String email) {
		String token = register(email);
		mvc.post()
			.uri("/api/household")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Home\", \"timeZone\": \"%s\"}".formatted(ZONE.getId()))
			.exchange();
		return token;
	}

	private long createDailyTask(String token) {
		MvcTestResult result = mvc.post()
			.uri("/api/tasks")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}")
			.exchange();
		assertThat(result).hasStatus(201);
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
	}

	private MvcTestResult schedule(String token, LocalDate from, LocalDate to) {
		return mvc.get()
			.uri("/api/schedule?from={from}&to={to}", from, to)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
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
