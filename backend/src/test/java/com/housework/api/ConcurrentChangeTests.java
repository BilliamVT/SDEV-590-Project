package com.housework.api;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.support.TransactionTemplate;

import com.housework.api.schedule.OccurrenceNotMovableException;
import com.housework.api.schedule.OccurrenceStatus;
import com.housework.api.schedule.ScheduleService;
import com.housework.api.task.BacklogDtos.CreateItemRequest;
import com.housework.api.task.BacklogService;
import com.housework.api.task.Frequency;
import com.housework.api.task.TaskNotFoundException;
import com.housework.api.task.TaskDtos.CreateTaskRequest;
import com.housework.api.task.TaskService;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Two members changing the same thing at the same moment (decision record 0007, BILLIAMVT-54).
 * <p>
 * Each test holds the first change open in a transaction, starts the second on another thread,
 * waits long enough for it to read, then commits the first. Without row locks the second
 * change read the old state and overwrote the first. With them it waits for the first to commit,
 * then sees its result; after the fix the outcome doesn't depend on that wait.
 * <p>
 * Not {@code @Transactional}: the changes have to commit for the other thread to see them. Each
 * account is unique, and is deleted afterwards with everything in its household (BILLIAMVT-41),
 * so other tests' counts aren't affected.
 */
@IntegrationTest
class ConcurrentChangeTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	/** Long enough for the second change to read before the first commits. */
	private static final long OVERLAP_MS = 400;

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private TransactionTemplate tx;

	@Autowired
	private TaskService taskService;

	@Autowired
	private ScheduleService scheduleService;

	@Autowired
	private BacklogService backlogService;

	private final LocalDate today = LocalDate.now(ZONE);

	private final List<Member> members = new ArrayList<>();

	@AfterEach
	void deleteAccounts() {
		for (Member member : members) {
			assertThat(mvc.delete()
				.uri("/api/me")
				.header(HttpHeaders.AUTHORIZATION, "Bearer " + member.token)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"password\": \"correct-horse\"}")).hasStatus(204);
		}
	}

	@Test
	void viewingTheWeekWhileSomeonePausesATaskDoesntUndoThePause() {
		Member pat = member();
		long taskId = createDailyTask(pat);

		CompletableFuture<?> view = overlapping(() -> taskService.pause(pat.id, taskId),
				() -> scheduleService.schedule(pat.id, today.plusWeeks(5), today.plusWeeks(6)));

		view.join();
		assertThat(jdbc.sql("select active from task where id = ?").param(taskId).query(Boolean.class).single())
			.as("still paused")
			.isFalse();
		assertThat(pendingFrom(taskId, today.plusDays(1))).as("no new days for the paused task").isZero();
	}

	@Test
	void viewingTheWeekWhileSomeoneRenamesATaskKeepsTheNewName() {
		Member pat = member();
		long taskId = createDailyTask(pat);

		CompletableFuture<?> view = overlapping(() -> rename(pat, taskId, "Wash dishes"),
				() -> scheduleService.schedule(pat.id, today.plusWeeks(5), today.plusWeeks(6)));

		view.join();
		assertThat(jdbc.sql("select name from task where id = ?").param(taskId).query(String.class).single())
			.isEqualTo("Wash dishes");
	}

	@Test
	void anItemMarkedDoneWhileSomeoneSchedulesItEndsUpOnOneDay() {
		Member pat = member();
		long itemId = backlogService.create(pat.id, new CreateItemRequest("Hang shelves", null)).id();

		CompletableFuture<?> schedule = overlapping(() -> backlogService.done(pat.id, itemId, today),
				() -> backlogService.schedule(pat.id, itemId, today.plusDays(3)));

		assertThat(failure(schedule)).as("already off the backlog").isInstanceOf(TaskNotFoundException.class);
		assertThat(jdbc.sql("select status from occurrence where task_id = ?").param(itemId).query(String.class).list())
			.containsExactly("DONE");
	}

	@Test
	void aDayMarkedDoneWhileSomeoneMovesItStaysDoneWhereItWas() {
		Member pat = member();
		long taskId = createDailyTask(pat);
		long occurrenceId = occurrenceId(taskId, today);

		CompletableFuture<?> move = overlapping(
				() -> scheduleService.changeStatus(pat.id, occurrenceId, OccurrenceStatus.DONE),
				() -> scheduleService.move(pat.id, occurrenceId, today.plusDays(2)));

		assertThat(failure(move)).as("a done day can't be moved").isInstanceOf(OccurrenceNotMovableException.class);
		var row = jdbc.sql("select status, scheduled_date from occurrence where id = ?")
			.param(occurrenceId)
			.query((rs, n) -> List.of(rs.getString(1), rs.getObject(2, LocalDate.class)))
			.single();
		assertThat(row).containsExactly("DONE", today);
	}

	/**
	 * Runs {@code first} in a transaction, starts {@code second} on another thread while it's still
	 * open, then commits. Returns the second, finished.
	 */
	private CompletableFuture<?> overlapping(Runnable first, Runnable second) {
		CompletableFuture<?>[] started = new CompletableFuture<?>[1];
		tx.executeWithoutResult((status) -> {
			first.run();
			started[0] = CompletableFuture.runAsync(second);
			sleep();
		});
		try {
			started[0].get(10, TimeUnit.SECONDS);
		}
		catch (Exception ignored) {
			// Checked by the caller through failure() or join()
		}
		return started[0];
	}

	private static Throwable failure(CompletableFuture<?> future) {
		try {
			future.join();
			return null;
		}
		catch (CompletionException ex) {
			return ex.getCause();
		}
	}

	private static void sleep() {
		try {
			Thread.sleep(OVERLAP_MS);
		}
		catch (InterruptedException ex) {
			Thread.currentThread().interrupt();
		}
	}

	private void rename(Member member, long taskId, String name) {
		taskService.update(member.id, taskId, new CreateTaskRequest(name, Frequency.DAILY, null, null, null, null, null));
	}

	private long pendingFrom(long taskId, LocalDate from) {
		return jdbc.sql("select count(*) from occurrence where task_id = ? and status = 'PENDING' and scheduled_date >= ?")
			.params(taskId, from)
			.query(Long.class)
			.single();
	}

	private long occurrenceId(long taskId, LocalDate originalDate) {
		return jdbc.sql("select id from occurrence where task_id = ? and original_date = ?")
			.params(taskId, originalDate)
			.query(Long.class)
			.single();
	}

	private record Member(long id, String token) {
	}

	/** A new account with its own household; unique, since these tests commit. */
	private Member member() {
		String email = "concurrent-" + System.nanoTime() + "@example.com";
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"correct-horse\", \"displayName\": \"Pat\"}".formatted(email))
			.exchange();
		String token = JsonPath.read(body(registered), "$.token");
		mvc.post()
			.uri("/api/household")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Home\", \"timeZone\": \"%s\"}".formatted(ZONE.getId()))
			.exchange();
		long id = jdbc.sql("select id from app_user where email = ?").param(email).query(Long.class).single();
		Member member = new Member(id, token);
		members.add(member);
		return member;
	}

	private long createDailyTask(Member member) {
		MvcTestResult result = mvc.post()
			.uri("/api/tasks")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + member.token)
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
