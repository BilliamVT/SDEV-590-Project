package com.housework.api.feature;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * With the drag-drop flag off, as in production (decision record 0002). The flag only hides the
 * drag UI (BILLIAMVT-28); moving a day works either way, released with BILLIAMVT-56.
 */
@IntegrationTest
@TestPropertySource(properties = "features.drag-drop=false")
@Transactional
class FeatureFlagOffTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Test
	void theFeaturesEndpointSaysItsOff() {
		MvcTestResult result = mvc.get().uri("/api/features").exchange();

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<Boolean>read(body(result), "$.dragDrop")).isFalse();
	}

	@Test
	void movingADayWorksWithTheFlagOff() {
		String token = registerWithHousehold();
		long taskId = createDailyTask(token);
		LocalDate today = LocalDate.now(ZONE);
		long id = jdbc.sql("select id from occurrence where task_id = ? and original_date = ?")
			.params(taskId, today)
			.query(Long.class)
			.single();

		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/date", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\": \"%s\"}".formatted(today.plusDays(1)))).hasStatusOk();

		assertThat(jdbc.sql("select scheduled_date from occurrence where id = ?").param(id).query(LocalDate.class).single())
			.isEqualTo(today.plusDays(1));
	}

	private String registerWithHousehold() {
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"pat@example.com\", \"password\": \"correct-horse\", \"displayName\": \"Pat\"}")
			.exchange();
		String token = JsonPath.read(body(registered), "$.token");
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

	private static String body(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
