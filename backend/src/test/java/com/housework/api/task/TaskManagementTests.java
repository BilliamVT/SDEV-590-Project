package com.housework.api.task;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
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

/** Viewing, editing, pausing and deleting tasks (BILLIAMVT-22). */
@IntegrationTest
@Transactional
class TaskManagementTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void listsTheHouseholdsTasksByNameWithPausedOnesMarked() {
		String token = registerWithHousehold("pat@example.com");
		createTask(token, "{\"name\": \"Vacuum\", \"frequency\": \"WEEKLY\", \"daysOfWeek\": [\"SATURDAY\"]}");
		long dishes = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		long gone = createTask(token, "{\"name\": \"Gutters\", \"frequency\": \"QUARTERLY\"}");
		send(token, "POST", "/api/tasks/" + dishes + "/pause");
		send(token, "DELETE", "/api/tasks/" + gone);

		MvcTestResult result = send(token, "GET", "/api/tasks");

		assertThat(JsonPath.<List<String>>read(body(result), "$[*].name")).containsExactly("Dishes", "Vacuum");
		assertThat(JsonPath.<List<Boolean>>read(body(result), "$[*].active")).containsExactly(false, true);
		assertThat(JsonPath.<List<String>>read(body(result), "$[*].schedule")).containsExactly("Every day", "Every week on Saturday");
	}

	@Test
	void oneTaskIncludesItsMenuFieldsForTheEditForm() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, """
				{"name": "Sheets", "frequency": "EVERY_N_WEEKS", "interval": 2, "daysOfWeek": ["THURSDAY", "SUNDAY"], "estimatedMinutes": 20}
				""");

		MvcTestResult result = send(token, "GET", "/api/tasks/" + id);

		assertThat(text(result, "$.frequency")).isEqualTo("EVERY_N_WEEKS");
		assertThat(JsonPath.<Integer>read(body(result), "$.interval")).isEqualTo(2);
		assertThat(JsonPath.<java.util.List<String>>read(body(result), "$.daysOfWeek")).containsExactly("SUNDAY", "THURSDAY");
		assertThat(JsonPath.<Integer>read(body(result), "$.estimatedMinutes")).isEqualTo(20);
	}

	@Test
	void renamingKeepsTheExistingOccurrences() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		List<Long> before = occurrenceIds(id);

		MvcTestResult result = update(token, id, "{\"name\": \"Wash dishes\", \"frequency\": \"DAILY\", \"estimatedMinutes\": 10}");

		assertThat(result).hasStatusOk();
		assertThat(text(result, "$.name")).isEqualTo("Wash dishes");
		assertThat(occurrenceIds(id)).isEqualTo(before);
	}

	@Test
	void anUnchangedScheduleThatStartedInThePastCanStillBeEdited() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Plants\", \"frequency\": \"EVERY_N_DAYS\", \"interval\": 3}");
		LocalDate past = today.minusDays(9);
		jdbc.sql("update task set starts_on = ? where id = ?").params(past, id).update();
		entityManager.clear();

		MvcTestResult result = update(token, id, """
				{"name": "Water plants", "frequency": "EVERY_N_DAYS", "interval": 3, "startsOn": "%s"}
				""".formatted(past));

		assertThat(result).hasStatusOk();
		assertThat(text(result, "$.startsOn")).isEqualTo(past.toString());
	}

	@Test
	void changingTheScheduleReplacesOnlyFutureOccurrences() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		// An occurrence from before today, and a future one already done
		jdbc.sql("insert into occurrence (task_id, original_date, scheduled_date) values (?, ?, ?)")
			.params(id, today.minusDays(2), today.minusDays(2)).update();
		jdbc.sql("update occurrence set status = 'DONE' where task_id = ? and original_date = ?")
			.params(id, today.plusDays(1)).update();

		update(token, id, "{\"name\": \"Dishes\", \"frequency\": \"WEEKLY\", \"daysOfWeek\": [\"SUNDAY\"]}");

		List<LocalDate> dates = dates(id);
		assertThat(dates).contains(today.minusDays(2), today.plusDays(1));
		LocalDate firstSunday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
		assertThat(dates.stream().filter(d -> d.isAfter(today.plusDays(1))).toList())
			.allMatch(d -> d.getDayOfWeek() == DayOfWeek.SUNDAY)
			.contains(firstSunday.isAfter(today.plusDays(1)) ? firstSunday : firstSunday.plusWeeks(1));
	}

	@Test
	void anEditedStartDateCantBeInThePast() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Plants\", \"frequency\": \"EVERY_N_DAYS\", \"interval\": 3}");

		MvcTestResult result = update(token, id, """
				{"name": "Plants", "frequency": "EVERY_N_DAYS", "interval": 3, "startsOn": "%s"}
				""".formatted(today.minusDays(1)));

		assertThat(result).hasStatus(400);
	}

	@Test
	void pausingStopsNewOccurrencesAndResumingDoesntFillInThePause() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");

		MvcTestResult paused = send(token, "POST", "/api/tasks/" + id + "/pause");

		assertThat(JsonPath.<Boolean>read(body(paused), "$.active")).isFalse();
		assertThat(dates(id)).allMatch(d -> d.isBefore(today));
		schedule(token, today.plusWeeks(6), today.plusWeeks(6).plusDays(6));
		assertThat(dates(id)).allMatch(d -> d.isBefore(today));

		// As if it had been paused for two weeks
		jdbc.sql("update task set generated_through = ? where id = ?").params(today.minusDays(15), id).update();
		entityManager.clear();
		MvcTestResult resumed = send(token, "POST", "/api/tasks/" + id + "/resume");

		assertThat(JsonPath.<Boolean>read(body(resumed), "$.active")).isTrue();
		assertThat(dates(id)).first().isEqualTo(today);
		assertThat(dates(id)).hasSize(29);
	}

	@Test
	void resumingFollowsTheTasksOwnRule() {
		String token = registerWithHousehold("pat@example.com");
		DayOfWeek otherDay = today.getDayOfWeek().plus(3);
		long id = createTask(token, "{\"name\": \"Vacuum\", \"frequency\": \"WEEKLY\", \"daysOfWeek\": [\"%s\"]}".formatted(otherDay));
		send(token, "POST", "/api/tasks/" + id + "/pause");

		send(token, "POST", "/api/tasks/" + id + "/resume");

		assertThat(dates(id)).isNotEmpty().allMatch(d -> d.getDayOfWeek() == otherDay);
	}

	@Test
	void deletingKeepsHistoryButRemovesWhatsComing() {
		String token = registerWithHousehold("pat@example.com");
		long id = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		jdbc.sql("insert into occurrence (task_id, original_date, scheduled_date) values (?, ?, ?)")
			.params(id, today.minusDays(2), today.minusDays(2)).update();
		jdbc.sql("update occurrence set scheduled_date = ? where task_id = ? and original_date = ?")
			.params(today.plusDays(5), id, today.plusDays(3)).update();

		assertThat(send(token, "DELETE", "/api/tasks/" + id)).hasStatus(204);

		assertThat(dates(id)).containsExactly(today.minusDays(2));
		assertThat(send(token, "GET", "/api/tasks/" + id)).hasStatus(404);
		MvcTestResult week = schedule(token, today.minusDays(3), today.plusDays(3));
		assertThat(JsonPath.<List<String>>read(body(week), "$.occurrences[*].taskName")).containsExactly("Dishes");
		assertThat(JsonPath.<List<Boolean>>read(body(week), "$.occurrences[*].overdue")).containsExactly(false);
		assertThat(JsonPath.<List<Boolean>>read(body(week), "$.occurrences[*].taskDeleted")).containsExactly(true);
	}

	@Test
	void anotherHouseholdsTaskIsNotFound() {
		String alex = registerWithHousehold("alex@example.com");
		String blair = registerWithHousehold("blair@example.com");
		long id = createTask(alex, "{\"name\": \"Alex's chore\", \"frequency\": \"DAILY\"}");

		assertThat(send(blair, "GET", "/api/tasks/" + id)).hasStatus(404);
		assertThat(update(blair, id, "{\"name\": \"Mine now\", \"frequency\": \"DAILY\"}")).hasStatus(404);
		assertThat(send(blair, "POST", "/api/tasks/" + id + "/pause")).hasStatus(404);
		assertThat(send(blair, "POST", "/api/tasks/" + id + "/resume")).hasStatus(404);
		assertThat(send(blair, "DELETE", "/api/tasks/" + id)).hasStatus(404);
		assertThat(JsonPath.<List<Object>>read(body(send(blair, "GET", "/api/tasks")), "$")).isEmpty();
		assertThat(text(send(alex, "GET", "/api/tasks/" + id), "$.name")).isEqualTo("Alex's chore");
	}

	@Test
	void managingTasksRequiresLogin() {
		assertThat(mvc.get().uri("/api/tasks")).hasStatus(401);
		assertThat(mvc.delete().uri("/api/tasks/1")).hasStatus(401);
	}

	private List<LocalDate> dates(long taskId) {
		entityManager.flush();
		return jdbc.sql("select original_date from occurrence where task_id = ? order by original_date")
			.param(taskId).query(LocalDate.class).list();
	}

	private List<Long> occurrenceIds(long taskId) {
		entityManager.flush();
		return jdbc.sql("select id from occurrence where task_id = ? order by id").param(taskId).query(Long.class).list();
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

	private long createTask(String token, String json) {
		MvcTestResult result = mvc.post()
			.uri("/api/tasks")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
		assertThat(result).hasStatus(201);
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
	}

	private MvcTestResult update(String token, long id, String json) {
		return mvc.put()
			.uri("/api/tasks/" + id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private MvcTestResult send(String token, String method, String uri) {
		var request = switch (method) {
			case "GET" -> mvc.get();
			case "POST" -> mvc.post();
			default -> mvc.delete();
		};
		return request.uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
	}

	private MvcTestResult schedule(String token, LocalDate from, LocalDate to) {
		return mvc.get()
			.uri("/api/schedule?from={from}&to={to}", from, to)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.exchange();
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
