package com.housework.api.schedule;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

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

/** Moving one occurrence to another day (BILLIAMVT-27), with the drag-drop flag on (test profile). */
@IntegrationTest
@Transactional
class MoveOccurrenceTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void aMovedDayShowsOnItsNewDateAndKeepsItsOriginal() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today);

		MvcTestResult result = move(token, id, today.plusDays(2));

		assertThat(result).hasStatusOk();
		assertThat(text(result, "$.date")).isEqualTo(today.plusDays(2).toString());
		assertThat(text(result, "$.originalDate")).isEqualTo(today.toString());
		assertThat(text(result, "$.status")).isEqualTo("PENDING");
		assertThat(ids(schedule(token, today, today))).doesNotContain((int) id);
		// The daily task is already on that day: both show
		assertThat(ids(schedule(token, today.plusDays(2), today.plusDays(2)))).hasSize(2).contains((int) id);
	}

	@Test
	void movingItBackToItsOriginalDateMakesItANormalDayAgain() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today.plusDays(1));
		move(token, id, today.plusDays(3));

		MvcTestResult back = move(token, id, today.plusDays(1));

		assertThat(text(back, "$.date")).isEqualTo(text(back, "$.originalDate"));
		// A normal day is replaced when the schedule is rebuilt (pausing), so it isn't kept twice
		send(token, "/api/tasks/" + taskId + "/pause");
		send(token, "/api/tasks/" + taskId + "/resume");
		assertThat(ids(schedule(token, today.plusDays(1), today.plusDays(1)))).hasSize(1).doesNotContain((int) id);
	}

	@Test
	void editingPausingAndResumingTheTaskKeepTheMove() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today.plusDays(1));
		move(token, id, today.plusDays(3));

		rename(token, taskId, "Wash dishes");
		send(token, "/api/tasks/" + taskId + "/pause");
		send(token, "/api/tasks/" + taskId + "/resume");

		String day = body(schedule(token, today.plusDays(3), today.plusDays(3)));
		assertThat(JsonPath.<List<Integer>>read(day, "$.occurrences[*].id")).contains((int) id);
		assertThat(JsonPath.<List<String>>read(day, "$.occurrences[?(@.id == %d)].taskName".formatted(id)))
			.containsExactly("Wash dishes");
		// The rule's own day isn't generated again
		assertThat(ids(schedule(token, today.plusDays(1), today.plusDays(1)))).isEmpty();
	}

	@Test
	void deletingTheTaskRemovesItsMovedDays() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today.plusDays(1));
		move(token, id, today.plusDays(3));

		assertThat(mvc.delete().uri("/api/tasks/{id}", taskId).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
			.hasStatus(204);

		assertThat(ids(schedule(token, today.plusDays(3), today.plusDays(3)))).isEmpty();
	}

	@Test
	void anOverdueDayMovedToTodayIsNoLongerOverdue() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		backdate(taskId, today.minusDays(2));
		schedule(token, today.minusDays(2), today);
		long id = occurrenceId(taskId, today.minusDays(1));

		MvcTestResult result = move(token, id, today);

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<Boolean>read(body(result), "$.overdue")).isFalse();
	}

	@Test
	void theNewDateMustBeFromTodayToTwoYearsAhead() {
		String token = registerWithHousehold("pat@example.com");
		long id = occurrenceId(createDailyTask(token), today.plusDays(1));

		MvcTestResult past = move(token, id, today.minusDays(1));
		assertThat(past).hasStatus(400);
		assertThat(text(past, "$.detail")).isEqualTo("Pick today or a later day.");
		MvcTestResult tooFar = move(token, id, today.plusYears(2).plusDays(1));
		assertThat(tooFar).hasStatus(400);
		assertThat(text(tooFar, "$.detail")).isEqualTo("Pick a day up to 2 years ahead.");

		assertThat(move(token, id, today)).hasStatusOk();
		assertThat(move(token, id, today.plusYears(2))).hasStatusOk();
	}

	@Test
	void aDayMovedPastTheGeneratedWeeksIsNotDuplicatedWhenTheyCatchUp() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long id = occurrenceId(taskId, today.plusDays(1));
		LocalDate farAhead = today.plusWeeks(10);

		move(token, id, farAhead);
		// Viewing that far ahead generates the weeks in between, including the daily task's own farAhead day
		schedule(token, farAhead.minusWeeks(5), farAhead);

		assertThat(ids(schedule(token, farAhead, farAhead))).hasSize(2).contains((int) id);
		assertThat(ids(schedule(token, today.plusDays(1), today.plusDays(1)))).isEmpty();
	}

	@Test
	void onlyAPendingDayOfATaskThatStillExistsCanBeMoved() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createDailyTask(token);
		long done = occurrenceId(taskId, today);
		long skipped = occurrenceId(taskId, today.plusDays(1));
		changeStatus(token, done, "DONE");
		changeStatus(token, skipped, "SKIPPED");

		assertThat(move(token, done, today.plusDays(2))).hasStatus(409);
		assertThat(move(token, skipped, today.plusDays(2))).hasStatus(409);

		// A deleted task's past days are history
		long otherTask = createDailyTask(token);
		backdate(otherTask, today.minusDays(1));
		schedule(token, today.minusDays(1), today);
		long overdue = occurrenceId(otherTask, today.minusDays(1));
		mvc.delete().uri("/api/tasks/{id}", otherTask).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
		MvcTestResult deleted = move(token, overdue, today);
		assertThat(deleted).hasStatus(409);
		assertThat(text(deleted, "$.detail")).isEqualTo("This task was deleted, so its days can't be moved.");
	}

	@Test
	void otherHouseholdsUnknownDaysBadRequestsAndNoLoginAreRefused() {
		String alex = registerWithHousehold("alex@example.com");
		String blair = registerWithHousehold("blair@example.com");
		long id = occurrenceId(createDailyTask(alex), today);

		assertThat(move(blair, id, today.plusDays(1))).hasStatus(404);
		assertThat(move(alex, Long.MAX_VALUE, today.plusDays(1))).hasStatus(404);
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/date", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + alex)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).hasStatus(400);
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/date", id)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\": \"%s\"}".formatted(today))).hasStatus(401);
		assertThat(ids(schedule(alex, today, today))).containsExactly((int) id);
	}

	@Test
	void theFeaturesEndpointSaysDragDropIsOnWithoutALogin() {
		MvcTestResult result = mvc.get().uri("/api/features").exchange();

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<Boolean>read(body(result), "$.dragDrop")).isTrue();
	}

	private MvcTestResult move(String token, long id, LocalDate date) {
		MvcTestResult result = mvc.put()
			.uri("/api/occurrences/{id}/date", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\": \"%s\"}".formatted(date))
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private void changeStatus(String token, long id, String status) {
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/status", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\": \"%s\"}".formatted(status))).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
	}

	private void rename(String token, long taskId, String name) {
		assertThat(mvc.put()
			.uri("/api/tasks/{id}", taskId)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"%s\", \"frequency\": \"DAILY\"}".formatted(name))).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
	}

	private void send(String token, String uri) {
		assertThat(mvc.post().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token)).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
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

	private String registerWithHousehold(String email) {
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"correct-horse\", \"displayName\": \"Pat\"}".formatted(email))
			.exchange();
		String token = text(registered, "$.token");
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

	private static List<Integer> ids(MvcTestResult schedule) {
		return JsonPath.read(body(schedule), "$.occurrences[*].id");
	}

	private static String text(MvcTestResult result, String path) {
		return JsonPath.read(body(result), path);
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
