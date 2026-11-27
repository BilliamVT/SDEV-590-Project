package com.housework.api.task;

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
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/** A color the household picks for a task (BILLIAMVT-65). */
@IntegrationTest
@Transactional
class ColorTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	@Test
	void aTasksColorShowsOnTheTaskAndEveryDay() {
		String token = register("pat@example.com");
		MvcTestResult created = post(token, "/api/tasks", "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"color\": \"TEAL\"}");
		assertThat(created).hasStatus(201);
		long taskId = number(created, "$.id");

		assertThat(text(get(token, "/api/tasks/" + taskId), "$.color")).isEqualTo("TEAL");
		assertThat(JsonPath.<List<String>>read(body(schedule(token)), "$.occurrences[*].color")).hasSize(3)
			.containsOnly("TEAL");
	}

	@Test
	void aTaskHasNoColorUnlessOneIsPicked() {
		String token = register("pat@example.com");
		long taskId = number(post(token, "/api/tasks", "{\"name\": \"Dishes\", \"frequency\": \"DAILY\"}"), "$.id");

		assertThat(JsonPath.<Object>read(body(get(token, "/api/tasks/" + taskId)), "$.color")).isNull();
		assertThat(JsonPath.<Object>read(body(schedule(token)), "$.occurrences[0].color")).isNull();
	}

	@Test
	void editingATaskChangesOrClearsItsColor() {
		String token = register("pat@example.com");
		long taskId = number(post(token, "/api/tasks", "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"color\": \"RED\"}"),
				"$.id");

		assertThat(put(token, "/api/tasks/" + taskId, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"color\": \"BLUE\"}"))
			.hasStatusOk();
		assertThat(JsonPath.<List<String>>read(body(schedule(token)), "$.occurrences[*].color")).containsOnly("BLUE");

		assertThat(put(token, "/api/tasks/" + taskId, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"color\": null}"))
			.hasStatusOk();
		assertThat(JsonPath.<Object>read(body(get(token, "/api/tasks/" + taskId)), "$.color")).isNull();
	}

	@Test
	void aBacklogItemAndAOneTimeTaskCanHaveAColor() {
		String token = register("pat@example.com");

		assertThat(post(token, "/api/backlog", "{\"name\": \"Hang shelves\", \"color\": \"PURPLE\"}")).hasStatus(201);
		assertThat(text(get(token, "/api/backlog"), "$[0].color")).isEqualTo("PURPLE");

		assertThat(post(token, "/api/backlog", "{\"name\": \"Vacuum\", \"date\": \"%s\", \"color\": \"ORANGE\"}".formatted(today)))
			.hasStatus(201);
		assertThat(text(get(token, "/api/schedule?from=%s&to=%s".formatted(today, today)), "$.occurrences[0].color"))
			.isEqualTo("ORANGE");
	}

	@Test
	void aColorTheAppDoesntKnowIsRefused() {
		String token = register("pat@example.com");

		assertThat(post(token, "/api/tasks", "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"color\": \"MAUVE\"}"))
			.hasStatus(400);
		assertThat(post(token, "/api/backlog", "{\"name\": \"Hang shelves\", \"color\": \"#ff0000\"}")).hasStatus(400);
	}

	private String register(String email) {
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"correct-horse\", \"displayName\": \"Pat\"}".formatted(email))
			.exchange();
		String token = text(registered, "$.token");
		post(token, "/api/household", "{\"name\": \"Home\", \"timeZone\": \"%s\"}".formatted(ZONE.getId()));
		return token;
	}

	private MvcTestResult schedule(String token) {
		return get(token, "/api/schedule?from=%s&to=%s".formatted(today, today.plusDays(2)));
	}

	private MvcTestResult post(String token, String uri, String json) {
		MvcTestResult result = mvc.post()
			.uri(uri)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private MvcTestResult put(String token, String uri, String json) {
		MvcTestResult result = mvc.put()
			.uri(uri)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private MvcTestResult get(String token, String uri) {
		return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
	}

	private static long number(MvcTestResult result, String path) {
		return ((Number) JsonPath.read(body(result), path)).longValue();
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
