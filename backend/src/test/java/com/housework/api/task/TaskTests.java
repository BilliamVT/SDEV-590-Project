package com.housework.api.task;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;
import com.housework.api.user.AppUserRepository;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
class TaskTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private TaskRepository tasks;

	@Autowired
	private AppUserRepository users;

	@Test
	void createsAWeeklyTaskInTheUsersHousehold() {
		String token = registerWithHousehold("pat@example.com", "Pacific/Auckland");

		MvcTestResult result = create(token, """
				{"name": "  Vacuum  ", "frequency": "WEEKLY", "daysOfWeek": ["SATURDAY"], "estimatedMinutes": 30}
				""");

		assertThat(result).hasStatus(201);
		assertThat(text(result, "$.name")).isEqualTo("Vacuum");
		assertThat(text(result, "$.recurrenceRule")).isEqualTo("FREQ=WEEKLY;BYDAY=SA");
		assertThat(text(result, "$.schedule")).isEqualTo("Every week on Saturday");
		// "Today" is the household's, not the server's
		assertThat(text(result, "$.startsOn")).isEqualTo(LocalDate.now(ZoneId.of("Pacific/Auckland")).toString());
		Task task = tasks.findById(Long.valueOf(String.valueOf((Object) JsonPath.read(body(result), "$.id")))).orElseThrow();
		assertThat(task.getHouseholdId()).isEqualTo(users.findByEmail("pat@example.com").orElseThrow().getHouseholdId());
		assertThat(task.getEstimatedMinutes()).isEqualTo(30);
		assertThat(task.isActive()).isTrue();
	}

	@Test
	void aTaskCanRepeatOnSeveralDaysOfTheWeek() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");

		MvcTestResult result = create(token, """
				{"name": "Litter box", "frequency": "WEEKLY", "daysOfWeek": ["MONDAY", "SUNDAY", "FRIDAY", "WEDNESDAY", "THURSDAY", "MONDAY"]}
				""");

		assertThat(result).hasStatus(201);
		assertThat(text(result, "$.recurrenceRule")).isEqualTo("FREQ=WEEKLY;BYDAY=SU,MO,WE,TH,FR");
		assertThat(text(result, "$.schedule")).isEqualTo("Every week on Sun, Mon, Wed, Thu, Fri");
		assertThat(JsonPath.<List<String>>read(body(result), "$.daysOfWeek"))
			.containsExactly("SUNDAY", "MONDAY", "WEDNESDAY", "THURSDAY", "FRIDAY");
		assertThat(create(token, """
				{"name": "Laundry", "frequency": "WEEKLY", "daysOfWeek": []}
				""")).hasStatus(400);
	}

	@Test
	void intervalAndQuarterlyTasksKeepTheirChosenStartDate() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");
		String start = LocalDate.now().plusDays(3).toString();

		MvcTestResult everyTenDays = create(token, """
				{"name": "Water plants", "frequency": "EVERY_N_DAYS", "interval": 10, "startsOn": "%s"}
				""".formatted(start));

		assertThat(everyTenDays).hasStatus(201);
		assertThat(text(everyTenDays, "$.startsOn")).isEqualTo(start);
		assertThat(text(everyTenDays, "$.schedule")).isEqualTo("Every 10 days");
	}

	@Test
	void everyNWeeksStartsOnTheFirstChosenWeekdayOnOrAfterTheStartDate() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");
		LocalDate start = LocalDate.now(ZoneId.of("America/New_York")).plusDays(1);
		// One weekday later in the week than the start, and one earlier (so it falls in the next week)
		DayOfWeek later = start.getDayOfWeek().plus(2);
		DayOfWeek earlier = start.getDayOfWeek().minus(2);

		for (DayOfWeek day : List.of(later, earlier, start.getDayOfWeek())) {
			MvcTestResult result = create(token, """
					{"name": "Sheets", "frequency": "EVERY_N_WEEKS", "interval": 2, "daysOfWeek": ["%s"], "startsOn": "%s"}
					""".formatted(day, start));

			LocalDate expected = start.with(TemporalAdjusters.nextOrSame(day));
			assertThat(text(result, "$.startsOn")).as(day.toString()).isEqualTo(expected.toString());
		}
	}

	@Test
	void theStartDateCantBeInThePast() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");
		LocalDate today = LocalDate.now(ZoneId.of("America/New_York"));

		MvcTestResult yesterday = create(token, """
				{"name": "Water plants", "frequency": "EVERY_N_DAYS", "interval": 3, "startsOn": "%s"}
				""".formatted(today.minusDays(1)));
		MvcTestResult todayStart = create(token, """
				{"name": "Water plants", "frequency": "EVERY_N_DAYS", "interval": 3, "startsOn": "%s"}
				""".formatted(today));

		assertThat(yesterday).hasStatus(400);
		assertThat(text(yesterday, "$.detail")).isEqualTo("Choose a start date from today on.");
		assertThat(todayStart).hasStatus(201);
	}

	@Test
	void otherFrequenciesIgnoreAStartDate() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");

		MvcTestResult result = create(token, """
				{"name": "Dishes", "frequency": "DAILY", "startsOn": "2026-01-01"}
				""");

		assertThat(text(result, "$.startsOn")).isEqualTo(LocalDate.now(ZoneId.of("America/New_York")).toString());
	}

	@Test
	void anInvalidScheduleIsRejectedWithAReason() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");

		MvcTestResult noDay = create(token, """
				{"name": "Vacuum", "frequency": "WEEKLY"}
				""");
		MvcTestResult farStart = create(token, """
				{"name": "Gutters", "frequency": "EVERY_N_WEEKS", "interval": 26, "daysOfWeek": ["SATURDAY"], "startsOn": "2030-01-01"}
				""");

		assertThat(noDay).hasStatus(400);
		assertThat(text(noDay, "$.detail")).isEqualTo("Choose at least one day of the week.");
		assertThat(text(farStart, "$.detail")).isEqualTo("Choose a start date within a year of today.");
		assertThat(tasks.count()).isZero();
	}

	@Test
	void invalidFieldsAreRejected() {
		String token = registerWithHousehold("pat@example.com", "America/New_York");

		assertThat(create(token, "{\"name\": \" \", \"frequency\": \"DAILY\"}")).hasStatus(400);
		assertThat(create(token, "{\"name\": \"Dishes\"}")).hasStatus(400);
		assertThat(create(token, "{\"name\": \"Dishes\", \"frequency\": \"HOURLY\"}")).hasStatus(400);
		assertThat(create(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"estimatedMinutes\": 0}")).hasStatus(400);
		assertThat(create(token, "{\"name\": \"%s\", \"frequency\": \"DAILY\"}".formatted("x".repeat(101)))).hasStatus(400);
		assertThat(tasks.count()).isZero();
	}

	@Test
	void creatingATaskNeedsAHousehold() {
		String token = register("pat@example.com");

		assertThat(create(token, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}")).hasStatus(404);
	}

	@Test
	void creatingATaskRequiresLogin() {
		assertThat(mvc.post().uri("/api/tasks").contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}")).hasStatus(401);
	}

	private String register(String email) {
		MvcTestResult result = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "%s", "password": "correct-horse", "displayName": "Pat"}
					""".formatted(email))
			.exchange();
		return text(result, "$.token");
	}

	private String registerWithHousehold(String email, String timeZone) {
		String token = register(email);
		mvc.post()
			.uri("/api/household")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Home\", \"timeZone\": \"%s\"}".formatted(timeZone))
			.exchange();
		return token;
	}

	private MvcTestResult create(String token, String json) {
		return mvc.post()
			.uri("/api/tasks")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
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
