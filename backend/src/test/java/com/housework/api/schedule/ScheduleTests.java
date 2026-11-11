package com.housework.api.schedule;

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
import com.housework.api.task.Task;
import com.housework.api.task.TaskRepository;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
class ScheduleTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private TaskRepository tasks;

	@Autowired
	private ScheduleGenerator generator;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void creatingATaskGeneratesFourWeeksAhead() {
		String token = registerWithHousehold("pat@example.com");

		long taskId = createTask(token, "{\"name\": \"Vacuum\", \"frequency\": \"WEEKLY\", \"dayOfWeek\": \"SATURDAY\"}");

		LocalDate firstSaturday = today.with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY));
		List<LocalDate> expected = firstSaturday.datesUntil(today.plusWeeks(4).plusDays(1), java.time.Period.ofWeeks(1))
			.toList();
		assertThat(dates(taskId)).containsExactlyElementsOf(expected);
		assertThat(tasks.findById(taskId).orElseThrow().getGeneratedThrough()).isEqualTo(today.plusWeeks(4));
	}

	@Test
	void everyTwoWeeksFirstFallsOnTheNextChosenWeekday() {
		String token = registerWithHousehold("pat@example.com");
		DayOfWeek day = today.getDayOfWeek().plus(4);

		long taskId = createTask(token, """
				{"name": "Sheets", "frequency": "EVERY_N_WEEKS", "interval": 2, "dayOfWeek": "%s", "startsOn": "%s"}
				""".formatted(day, today));

		LocalDate first = today.with(TemporalAdjusters.nextOrSame(day));
		assertThat(dates(taskId)).containsExactly(first, first.plusWeeks(2));
	}

	@Test
	void theScheduleListsTheWeeksOccurrencesWithTheirTasks() {
		String token = registerWithHousehold("pat@example.com");
		createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"estimatedMinutes\": 15}");

		MvcTestResult result = schedule(token, today, today.plusDays(6));

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<List<String>>read(body(result), "$.occurrences[*].taskName")).hasSize(7).containsOnly("Dishes");
		assertThat(JsonPath.<String>read(body(result), "$.occurrences[0].date")).isEqualTo(today.toString());
		assertThat(JsonPath.<String>read(body(result), "$.occurrences[0].status")).isEqualTo("PENDING");
		assertThat(JsonPath.<Integer>read(body(result), "$.occurrences[0].estimatedMinutes")).isEqualTo(15);
		assertThat(JsonPath.<String>read(body(result), "$.today")).isEqualTo(today.toString());
		assertThat(JsonPath.<String>read(body(result), "$.lastViewableDate")).isEqualTo(today.plusYears(2).toString());
	}

	@Test
	void viewingFurtherAheadGeneratesThroughThatWeekOnly() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		LocalDate weekSeven = today.plusWeeks(7);

		MvcTestResult result = schedule(token, weekSeven, weekSeven.plusDays(6));

		assertThat(JsonPath.<List<String>>read(body(result), "$.occurrences[*].date")).hasSize(7);
		entityManager.clear();
		assertThat(tasks.findById(taskId).orElseThrow().getGeneratedThrough()).isEqualTo(weekSeven.plusDays(6));
		// Weeks 5 and 6 were filled in too: every day from today through the end of week 7
		assertThat(dates(taskId)).hasSize((int) (weekSeven.plusDays(6).toEpochDay() - today.toEpochDay() + 1));
	}

	@Test
	void generatingAgainCreatesNoDuplicates() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		int before = dates(taskId).size();

		schedule(token, today, today.plusDays(6));
		Task task = tasks.findById(taskId).orElseThrow();
		task.markGeneratedThrough(null);
		generator.generateAhead(task, today);

		assertThat(dates(taskId)).hasSize(before);
	}

	@Test
	void daysNobodyViewedAreFilledInAndShowAsOverdue() {
		String token = registerWithHousehold("pat@example.com");
		LocalDate tenDaysAgo = today.minusDays(10);
		long taskId = createTask(token, "{\"name\": \"Water plants\", \"frequency\": \"EVERY_N_DAYS\", \"interval\": 2}");
		backdate(taskId, tenDaysAgo);

		MvcTestResult result = schedule(token, tenDaysAgo, today.plusDays(2));

		List<String> dates = JsonPath.read(body(result), "$.occurrences[*].date");
		List<Boolean> overdue = JsonPath.read(body(result), "$.occurrences[*].overdue");
		assertThat(dates).first().isEqualTo(tenDaysAgo.toString());
		for (int i = 0; i < dates.size(); i++) {
			assertThat(overdue.get(i)).as(dates.get(i)).isEqualTo(LocalDate.parse(dates.get(i)).isBefore(today));
		}
		assertThat(overdue).contains(true, false);
	}

	@Test
	void pausedTasksGetNoNewOccurrences() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		pause(taskId);
		int before = dates(taskId).size();

		schedule(token, today.plusWeeks(10), today.plusWeeks(10).plusDays(6));

		assertThat(dates(taskId)).hasSize(before);
	}

	@Test
	void regeneratingKeepsDoneSkippedMovedAndPastOccurrences() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"EVERY_N_DAYS\", \"interval\": 2}");
		backdate(taskId, today.minusDays(4));
		generator.generateAhead(tasks.findById(taskId).orElseThrow(), today);
		List<LocalDate> future = dates(taskId).stream().filter(d -> d.isAfter(today)).toList();
		LocalDate done = future.get(0);
		LocalDate skipped = future.get(1);
		LocalDate moved = future.get(2);
		jdbc.sql("update occurrence set status = 'DONE' where task_id = ? and original_date = ?").params(taskId, done).update();
		jdbc.sql("update occurrence set status = 'SKIPPED' where task_id = ? and original_date = ?").params(taskId, skipped).update();
		jdbc.sql("update occurrence set scheduled_date = scheduled_date + 1 where task_id = ? and original_date = ?")
			.params(taskId, moved).update();
		long untouchedFutureId = occurrenceId(taskId, future.get(3));
		long pastId = occurrenceId(taskId, today.minusDays(4));

		pause(taskId);
		generator.regenerate(tasks.findById(taskId).orElseThrow(), today);

		List<LocalDate> remaining = dates(taskId);
		assertThat(remaining).contains(today.minusDays(4), done, skipped, moved).doesNotContain(future.get(3));
		assertThat(count("select count(*) from occurrence where id = ?", pastId)).isOne();
		assertThat(count("select count(*) from occurrence where id = ?", untouchedFutureId)).isZero();
	}

	@Test
	void regeneratingAnActiveTaskReplacesItsFutureOccurrences() {
		String token = registerWithHousehold("pat@example.com");
		long taskId = createTask(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}");
		long oldFutureId = occurrenceId(taskId, today.plusDays(3));

		generator.regenerate(tasks.findById(taskId).orElseThrow(), today);

		assertThat(count("select count(*) from occurrence where id = ?", oldFutureId)).isZero();
		assertThat(dates(taskId)).contains(today.plusDays(3)).hasSize(29);
	}

	@Test
	void otherHouseholdsSeeNothing() {
		String alex = registerWithHousehold("alex@example.com");
		String blair = registerWithHousehold("blair@example.com");
		createTask(alex, "{\"name\": \"Alex's chore\", \"frequency\": \"DAILY\"}");

		MvcTestResult result = schedule(blair, today, today.plusDays(6));

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<List<Object>>read(body(result), "$.occurrences")).isEmpty();
	}

	@Test
	void rangesMustBeForwardAtMostSixWeeksAndWithinTwoYears() {
		String token = registerWithHousehold("pat@example.com");

		assertThat(detail(schedule(token, today, today.minusDays(1)))).isEqualTo("The end date must be on or after the start date.");
		assertThat(schedule(token, today, today.plusDays(41))).hasStatusOk();
		assertThat(detail(schedule(token, today, today.plusDays(42)))).isEqualTo("View at most 6 weeks at a time.");
		assertThat(schedule(token, today.plusYears(2).minusDays(6), today.plusYears(2))).hasStatusOk();
		assertThat(detail(schedule(token, today.plusYears(2), today.plusYears(2).plusDays(1))))
			.isEqualTo("You can view the schedule up to 2 years ahead.");
		assertThat(mvc.get().uri("/api/schedule?from=" + today).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
			.hasStatus(400);
		assertThat(mvc.get().uri("/api/schedule?from=next-week&to=" + today).header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
			.hasStatus(400);
	}

	@Test
	void theScheduleNeedsAHouseholdAndALogin() {
		String token = register("pat@example.com");

		assertThat(schedule(token, today, today.plusDays(6))).hasStatus(404);
		assertThat(mvc.get().uri("/api/schedule?from=" + today + "&to=" + today)).hasStatus(401);
	}

	/** Makes a task look created on {@code startsOn} and not yet generated (start dates can't be in the past). */
	private void backdate(long taskId, LocalDate startsOn) {
		jdbc.sql("delete from occurrence where task_id = ?").param(taskId).update();
		jdbc.sql("update task set starts_on = ?, generated_through = null where id = ?").params(startsOn, taskId).update();
		entityManager.clear();
	}

	private void pause(long taskId) {
		jdbc.sql("update task set active = false where id = ?").param(taskId).update();
		entityManager.clear();
	}

	private List<LocalDate> dates(long taskId) {
		entityManager.flush();
		return jdbc.sql("select original_date from occurrence where task_id = ? order by original_date")
			.param(taskId)
			.query(LocalDate.class)
			.list();
	}

	private long occurrenceId(long taskId, LocalDate originalDate) {
		return jdbc.sql("select id from occurrence where task_id = ? and original_date = ?")
			.params(taskId, originalDate)
			.query(Long.class)
			.single();
	}

	private long count(String sql, long id) {
		return jdbc.sql(sql).param(id).query(Long.class).single();
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

	private MvcTestResult schedule(String token, LocalDate from, LocalDate to) {
		return mvc.get()
			.uri("/api/schedule?from={from}&to={to}", from, to)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.exchange();
	}

	private static String detail(MvcTestResult result) {
		assertThat(result).hasStatus(400);
		return JsonPath.read(body(result), "$.detail");
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
