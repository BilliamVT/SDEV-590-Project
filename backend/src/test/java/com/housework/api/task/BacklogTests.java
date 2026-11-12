package com.housework.api.task;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

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

/** One-off backlog items: add, list, schedule, mark done, and back to the backlog (BILLIAMVT-23). */
@IntegrationTest
@Transactional
class BacklogTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void addsItemsAndListsThemInTheOrderAdded() {
		String token = registerWithHousehold("pat@example.com");

		MvcTestResult shelves = add(token, "{\"name\": \"  Hang shelves  \", \"estimatedMinutes\": 45}");
		add(token, "{\"name\": \"Clean gutters\"}");

		assertThat(shelves).hasStatus(201);
		assertThat(JsonPath.<String>read(body(shelves), "$.name")).isEqualTo("Hang shelves");
		assertThat(JsonPath.<Integer>read(body(shelves), "$.estimatedMinutes")).isEqualTo(45);
		assertThat(names(token)).containsExactly("Hang shelves", "Clean gutters");
	}

	@Test
	void checksTheNameAndMinutes() {
		String token = registerWithHousehold("pat@example.com");

		assertThat(add(token, "{\"name\": \" \"}")).hasStatus(400);
		assertThat(add(token, "{\"name\": \"%s\"}".formatted("x".repeat(101)))).hasStatus(400);
		assertThat(add(token, "{\"name\": \"Shelves\", \"estimatedMinutes\": 0}")).hasStatus(400);
		assertThat(names(token)).isEmpty();
	}

	@Test
	void itemsArentTasksAndAreNeverGenerated() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));

		assertThat(JsonPath.<List<?>>read(body(get(token, "/api/tasks")), "$")).isEmpty();
		assertThat(get(token, "/api/tasks/" + id)).hasStatus(404);
		assertThat(mvc.delete().uri("/api/tasks/{id}", id).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
			.hasStatus(404);
		assertThat(week(token)).isEmpty();
	}

	@Test
	void schedulingPutsTheItemOnThatDayAndTakesItOffTheBacklog() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\", \"estimatedMinutes\": 45}"));

		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), today.plusDays(2))).hasStatus(204);

		assertThat(names(token)).isEmpty();
		List<Map<String, Object>> week = week(token);
		assertThat(week).hasSize(1);
		assertThat(week.getFirst()).containsEntry("taskName", "Hang shelves")
			.containsEntry("date", today.plusDays(2).toString())
			.containsEntry("status", "PENDING")
			.containsEntry("estimatedMinutes", 45)
			.containsEntry("oneOff", true);
	}

	@Test
	void itemsComeAfterTheDaysRecurringTasks() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Air filter\"}"));
		createDailyTask(token);
		put(token, "/api/backlog/%d/schedule".formatted(id), today);

		List<String> todays = JsonPath.read(body(schedule(token, today, today)), "$.occurrences[*].taskName");

		// "Air filter" sorts before "Dishes" by name, but one-off items go last
		assertThat(todays).containsExactly("Dishes", "Air filter");
	}

	@Test
	void schedulesFromTodayOnWithinTwoYears() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));

		MvcTestResult past = put(token, "/api/backlog/%d/schedule".formatted(id), today.minusDays(1));
		assertThat(past).hasStatus(400);
		assertThat(JsonPath.<String>read(body(past), "$.detail")).isEqualTo("Choose a day from today on.");
		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), today.plusYears(2).plusDays(1))).hasStatus(400);
		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), null)).hasStatus(400);
		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), today)).hasStatus(204);
	}

	@Test
	void doneOnAnEarlierDayShowsOnThatDayAsDone() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));

		assertThat(post(token, "/api/backlog/%d/done".formatted(id), today.minusDays(1))).hasStatus(204);

		assertThat(names(token)).isEmpty();
		List<Map<String, Object>> rows = JsonPath.read(
				body(schedule(token, today.minusDays(1), today.minusDays(1))), "$.occurrences");
		assertThat(rows).hasSize(1);
		assertThat(rows.getFirst()).containsEntry("status", "DONE")
			.containsEntry("completedByName", "Pat")
			.containsEntry("overdue", false);
		assertThat(rows.getFirst().get("completedAt")).isNotNull();
	}

	@Test
	void cantBeDoneInTheFuture() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));

		MvcTestResult tomorrow = post(token, "/api/backlog/%d/done".formatted(id), today.plusDays(1));

		assertThat(tomorrow).hasStatus(400);
		assertThat(JsonPath.<String>read(body(tomorrow), "$.detail")).isEqualTo("Choose today or an earlier day.");
		assertThat(names(token)).containsExactly("Hang shelves");
	}

	@Test
	void skippingTheDayPutsItBackAndItCanBeScheduledThereAgain() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));
		put(token, "/api/backlog/%d/schedule".formatted(id), today);
		long occurrence = occurrenceOf(id);

		changeStatus(token, occurrence, "SKIPPED");
		assertThat(names(token)).containsExactly("Hang shelves");

		// The same day again reuses the skipped day rather than adding a second one
		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), today)).hasStatus(204);
		entityManager.clear();
		assertThat(occurrenceOf(id)).isEqualTo(occurrence);
		assertThat(week(token).getFirst()).containsEntry("status", "PENDING").containsEntry("completedByName", null);
		assertThat(names(token)).isEmpty();
	}

	@Test
	void deletingTheDayPutsItBack() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));
		post(token, "/api/backlog/%d/done".formatted(id), today);

		mvc.delete().uri("/api/occurrences/{id}", occurrenceOf(id)).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
		entityManager.flush();
		entityManager.clear();

		assertThat(names(token)).containsExactly("Hang shelves");
	}

	@Test
	void undoingDoneLeavesItOnTheDay() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));
		post(token, "/api/backlog/%d/done".formatted(id), today);

		changeStatus(token, occurrenceOf(id), "PENDING");

		assertThat(names(token)).isEmpty();
		assertThat(week(token).getFirst()).containsEntry("status", "PENDING");
	}

	@Test
	void anItemAlreadyOnTheScheduleIsChangedFromTheWeekInstead() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));
		put(token, "/api/backlog/%d/schedule".formatted(id), today.plusDays(1));

		assertThat(put(token, "/api/backlog/%d/schedule".formatted(id), today.plusDays(3))).hasStatus(404);
		assertThat(post(token, "/api/backlog/%d/done".formatted(id), today)).hasStatus(404);
		assertThat(week(token)).hasSize(1);
	}

	@Test
	void deletingAnItemRemovesItFromTheBacklogForGood() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));

		assertThat(deleteItem(token, id)).hasStatus(204);

		assertThat(names(token)).isEmpty();
		assertThat(rowCount("select count(*) from task where id = ?", id)).isZero();
		assertThat(deleteItem(token, id)).hasStatus(404);
	}

	@Test
	void anItemOnADayCanBeDeletedForGoodWithItsDays() {
		String token = registerWithHousehold("pat@example.com");
		long id = id(add(token, "{\"name\": \"Hang shelves\"}"));
		post(token, "/api/backlog/%d/done".formatted(id), today);
		createDailyTask(token);

		assertThat(deleteItem(token, id)).hasStatus(204);

		assertThat(rowCount("select count(*) from occurrence where task_id = ?", id)).isZero();
		assertThat(names(token)).isEmpty();
		// Only the recurring task's day is left, and it isn't a one-off
		assertThat(week(token)).hasSize(7).allSatisfy(row -> assertThat(row).containsEntry("oneOff", false));
	}

	@Test
	void anotherHouseholdsItemsAreHiddenAndCantBeChanged() {
		String pat = registerWithHousehold("pat@example.com");
		String sam = registerWithHousehold("sam@example.com");
		long id = id(add(pat, "{\"name\": \"Hang shelves\"}"));

		assertThat(names(sam)).isEmpty();
		assertThat(put(sam, "/api/backlog/%d/schedule".formatted(id), today)).hasStatus(404);
		assertThat(post(sam, "/api/backlog/%d/done".formatted(id), today)).hasStatus(404);
		assertThat(deleteItem(sam, id)).hasStatus(404);
		assertThat(names(pat)).containsExactly("Hang shelves");
	}

	@Test
	void needsAHousehold() {
		String token = register("pat@example.com");

		assertThat(get(token, "/api/backlog")).hasStatus(404);
		assertThat(add(token, "{\"name\": \"Hang shelves\"}")).hasStatus(404);
	}

	private MvcTestResult deleteItem(String token, long id) {
		MvcTestResult result = mvc.delete()
			.uri("/api/backlog/{id}", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private long rowCount(String sql, long id) {
		entityManager.flush();
		return jdbc.sql(sql).param(id).query(Long.class).single();
	}

	private void createDailyTask(String token) {
		assertThat(mvc.post()
			.uri("/api/tasks")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}")).hasStatus(201);
	}

	private List<String> names(String token) {
		return JsonPath.read(body(get(token, "/api/backlog")), "$[*].name");
	}

	/** This week from today: what the week view would show of these items. */
	private List<Map<String, Object>> week(String token) {
		return JsonPath.read(body(schedule(token, today, today.plusDays(6))), "$.occurrences");
	}

	private long occurrenceOf(long taskId) {
		entityManager.flush();
		return jdbc.sql("select id from occurrence where task_id = ?").param(taskId).query(Long.class).single();
	}

	private MvcTestResult add(String token, String json) {
		return mvc.post()
			.uri("/api/backlog")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private MvcTestResult put(String token, String uri, LocalDate date) {
		return exchanged(mvc.put().uri(uri), token, date);
	}

	private MvcTestResult post(String token, String uri, LocalDate date) {
		return exchanged(mvc.post().uri(uri), token, date);
	}

	private MvcTestResult exchanged(MockMvcTester.MockMvcRequestBuilder request, String token, LocalDate date) {
		MvcTestResult result = request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(date == null ? "{}" : "{\"date\": \"%s\"}".formatted(date))
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private void changeStatus(String token, long occurrenceId, String status) {
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/status", occurrenceId)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\": \"%s\"}".formatted(status))).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
	}

	private MvcTestResult get(String token, String uri) {
		return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
	}

	private MvcTestResult schedule(String token, LocalDate from, LocalDate to) {
		return mvc.get()
			.uri("/api/schedule?from={from}&to={to}", from, to)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.exchange();
	}

	private static long id(MvcTestResult result) {
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
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

	private static String body(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
