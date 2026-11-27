package com.housework.api.schedule;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
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

/** Assigning a task, or a single day, to a household member (BILLIAMVT-64). */
@IntegrationTest
@Transactional
class AssignTests {

	private static final ZoneId ZONE = ZoneId.of("America/New_York");

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private EntityManager entityManager;

	private final LocalDate today = LocalDate.now(ZONE);

	private record Member(String token, long id) {
	}

	@Test
	void aTaskAssignedWhenCreatedShowsItsAssigneeOnEveryDay() {
		Member pat = register("pat@example.com", "Pat Lee");
		long taskId = createDailyTask(pat.token(), pat.id());

		assertThat(number(get(pat.token(), "/api/tasks/" + taskId), "$.assigneeId")).isEqualTo(pat.id());
		MvcTestResult week = schedule(pat.token(), today, today.plusDays(2));
		assertThat(JsonPath.<List<Integer>>read(body(week), "$.occurrences[*].assigneeId")).hasSize(3)
			.allMatch(id -> id == pat.id());
		assertThat(JsonPath.<List<String>>read(body(week), "$.occurrences[*].assigneeName")).containsOnly("Pat Lee");
	}

	@Test
	void anUnassignedTaskIsForAnyone() {
		Member pat = register("pat@example.com", "Pat");
		long taskId = createDailyTask(pat.token(), null);

		assertThat(JsonPath.<Object>read(body(get(pat.token(), "/api/tasks/" + taskId)), "$.assigneeId")).isNull();
		assertThat(JsonPath.<Object>read(body(schedule(pat.token(), today, today)), "$.occurrences[0].assigneeId"))
			.isNull();
	}

	@Test
	void aDayGivenItsOwnAssigneeKeepsItWhenTheTaskIsReassigned() {
		Member pat = register("pat@example.com", "Pat");
		Member sam = joinHouseholdOf(pat, "sam@example.com", "Sam");
		long taskId = createDailyTask(pat.token(), pat.id());
		long tomorrow = occurrenceId(taskId, today.plusDays(1));

		MvcTestResult assigned = assign(sam.token(), tomorrow, sam.id());
		assertThat(assigned).hasStatusOk();
		assertThat(text(assigned, "$.assigneeName")).isEqualTo("Sam");

		// Editing the task (assignee and schedule) rebuilds its days; the assigned one stays
		edit(pat.token(), taskId, "{\"name\": \"Dishes\", \"frequency\": \"EVERY_N_DAYS\", \"interval\": 2, "
				+ "\"startsOn\": \"%s\", \"assigneeId\": null}".formatted(today));

		Map<Long, Object> assignees = assigneesByOccurrence(schedule(pat.token(), today, today.plusDays(2)));
		assertThat(assignees.get(tomorrow)).isEqualTo((int) sam.id());
		assertThat(assignees).hasSize(3);
		assignees.forEach((id, assignee) -> {
			if (id != tomorrow) {
				assertThat(assignee).isNull();
			}
		});
	}

	@Test
	void aDayCanBeSetToAnyoneWhileTheTaskStaysAssigned() {
		Member pat = register("pat@example.com", "Pat");
		long taskId = createDailyTask(pat.token(), pat.id());
		long id = occurrenceId(taskId, today);

		MvcTestResult result = assign(pat.token(), id, null);

		assertThat(result).hasStatusOk();
		assertThat(JsonPath.<Object>read(body(result), "$.assigneeId")).isNull();
		assertThat(number(get(pat.token(), "/api/tasks/" + taskId), "$.assigneeId")).isEqualTo(pat.id());
		assertThat(number(schedule(pat.token(), today.plusDays(1), today.plusDays(1)), "$.occurrences[0].assigneeId"))
			.isEqualTo(pat.id());
	}

	@Test
	void clearingADaysAssigneeMakesItFollowTheTaskAgain() {
		Member pat = register("pat@example.com", "Pat");
		Member sam = joinHouseholdOf(pat, "sam@example.com", "Sam");
		long taskId = createDailyTask(pat.token(), pat.id());
		long id = occurrenceId(taskId, today);
		assertThat(JsonPath.<Boolean>read(body(schedule(pat.token(), today, today)), "$.occurrences[0].assignmentSet"))
			.isFalse();

		MvcTestResult assigned = assign(pat.token(), id, sam.id());
		assertThat(JsonPath.<Boolean>read(body(assigned), "$.assignmentSet")).isTrue();

		MvcTestResult cleared = followTask(pat.token(), id);
		assertThat(cleared).hasStatusOk();
		assertThat(number(cleared, "$.assigneeId")).isEqualTo(pat.id());
		assertThat(JsonPath.<Boolean>read(body(cleared), "$.assignmentSet")).isFalse();

		// It follows the task again: reassigning the task now reaches this day too
		edit(pat.token(), taskId, "{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"assigneeId\": %d}".formatted(sam.id()));
		assertThat(assigneesByOccurrence(schedule(pat.token(), today, today.plusDays(1)))).hasSize(2)
			.allSatisfy((day, assignee) -> assertThat(assignee).isEqualTo((int) sam.id()));
	}

	@Test
	void clearingFollowsTheSameRulesAsAssigning() {
		Member pat = register("pat@example.com", "Pat");
		Member blair = register("blair@example.com", "Blair");
		long taskId = createDailyTask(pat.token(), null);
		long done = occurrenceId(taskId, today);
		changeStatus(pat.token(), done, "DONE");

		assertThat(followTask(pat.token(), done)).hasStatus(409);
		assertThat(followTask(blair.token(), occurrenceId(taskId, today.plusDays(1)))).hasStatus(404);
		assertThat(mvc.delete().uri("/api/occurrences/{id}/assignee", done)).hasStatus(401);
	}

	@Test
	void aOneTimeTaskCanBeAssignedWhenAdded() {
		Member pat = register("pat@example.com", "Pat");

		MvcTestResult added = post(pat.token(), "/api/backlog",
				"{\"name\": \"Vacuum\", \"date\": \"%s\", \"assigneeId\": %d}".formatted(today, pat.id()));

		assertThat(added).hasStatus(201);
		assertThat(number(schedule(pat.token(), today, today), "$.occurrences[0].assigneeId")).isEqualTo(pat.id());
	}

	@Test
	void aBacklogItemIsAssignedAndItsDayFollowsIt() {
		Member pat = register("pat@example.com", "Pat");
		Member sam = joinHouseholdOf(pat, "sam@example.com", "Sam");
		long itemId = number(post(pat.token(), "/api/backlog", "{\"name\": \"Hang shelves\"}"), "$.id");
		assertThat(JsonPath.<Object>read(body(get(pat.token(), "/api/backlog")), "$[0].assigneeId")).isNull();

		MvcTestResult assigned = assignItem(pat.token(), itemId, sam.id());
		assertThat(assigned).hasStatusOk();
		assertThat(number(assigned, "$.assigneeId")).isEqualTo(sam.id());
		assertThat(number(get(pat.token(), "/api/backlog"), "$[0].assigneeId")).isEqualTo(sam.id());

		// Back to Anyone, then Sam again; scheduled, the day shows Sam
		assertThat(JsonPath.<Object>read(body(assignItem(pat.token(), itemId, null)), "$.assigneeId")).isNull();
		assignItem(pat.token(), itemId, sam.id());
		assertThat(mvc.put()
			.uri("/api/backlog/{id}/schedule", itemId)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + pat.token())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"date\": \"%s\"}".formatted(today))).hasStatus(204);
		entityManager.flush();
		entityManager.clear();
		assertThat(text(schedule(pat.token(), today, today), "$.occurrences[0].assigneeName")).isEqualTo("Sam");
	}

	@Test
	void onlyAnOpenBacklogItemCanBeAssignedToAMember() {
		Member pat = register("pat@example.com", "Pat");
		Member blair = register("blair@example.com", "Blair");
		long itemId = number(post(pat.token(), "/api/backlog", "{\"name\": \"Hang shelves\"}"), "$.id");
		long onADay = number(post(pat.token(), "/api/backlog", "{\"name\": \"Mop\", \"date\": \"%s\"}".formatted(today)),
				"$.id");

		assertThat(assignItem(pat.token(), itemId, blair.id())).hasStatus(400);
		assertThat(assignItem(blair.token(), itemId, blair.id())).hasStatus(404);
		// Already on a day: assigned from the week view instead
		assertThat(assignItem(pat.token(), onADay, pat.id())).hasStatus(404);
		assertThat(mvc.put()
			.uri("/api/backlog/{id}/assignee", itemId)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"assigneeId\": null}")).hasStatus(401);
	}

	private MvcTestResult assignItem(String token, long id, Long assigneeId) {
		MvcTestResult result = mvc.put()
			.uri("/api/backlog/{id}/assignee", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"assigneeId\": %s}".formatted(assigneeId))
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	@Test
	void onlyMembersOfTheHouseholdCanBeAssigned() {
		Member pat = register("pat@example.com", "Pat");
		Member blair = register("blair@example.com", "Blair");
		long taskId = createDailyTask(pat.token(), null);
		long id = occurrenceId(taskId, today);

		assertThat(post(pat.token(), "/api/tasks",
				"{\"name\": \"Mop\", \"frequency\": \"DAILY\", \"assigneeId\": %d}".formatted(blair.id())))
			.hasStatus(400);
		assertThat(post(pat.token(), "/api/backlog", "{\"name\": \"Mop\", \"assigneeId\": %d}".formatted(Long.MAX_VALUE)))
			.hasStatus(400);
		assertThat(assign(pat.token(), id, blair.id())).hasStatus(400);
		// Another household's day isn't found at all
		assertThat(assign(blair.token(), id, blair.id())).hasStatus(404);
		assertThat(mvc.put()
			.uri("/api/occurrences/{id}/assignee", id)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"assigneeId\": null}")).hasStatus(401);
	}

	@Test
	void doneSkippedAndDeletedTasksDaysCantBeAssigned() {
		Member pat = register("pat@example.com", "Pat");
		long taskId = createDailyTask(pat.token(), null);
		long done = occurrenceId(taskId, today);
		long skipped = occurrenceId(taskId, today.plusDays(1));
		changeStatus(pat.token(), done, "DONE");
		changeStatus(pat.token(), skipped, "SKIPPED");

		assertThat(assign(pat.token(), done, pat.id())).hasStatus(409);
		assertThat(assign(pat.token(), skipped, pat.id())).hasStatus(409);

		// A past day of a deleted task is kept as history, and can't be assigned
		jdbc.sql("update occurrence set scheduled_date = ?, original_date = ? where id = ?")
			.params(today.minusDays(3), today.minusDays(3), done)
			.update();
		jdbc.sql("update occurrence set status = 'PENDING', completed_by = null, completed_at = null where id = ?")
			.param(done)
			.update();
		assertThat(mvc.delete().uri("/api/tasks/{id}", taskId).header(HttpHeaders.AUTHORIZATION, "Bearer " + pat.token()))
			.hasStatus(204);
		entityManager.clear();
		assertThat(assign(pat.token(), done, pat.id())).hasStatus(409);
	}

	@Test
	void aMemberWhoLeavesIsTakenOffTheOldHouseholdsTasksAndDays() {
		Member pat = register("pat@example.com", "Pat");
		Member sam = joinHouseholdOf(pat, "sam@example.com", "Sam");
		long taskId = createDailyTask(pat.token(), sam.id());
		long day = occurrenceId(taskId, today.plusDays(1));
		assign(pat.token(), day, sam.id());
		Member casey = register("casey@example.com", "Casey");

		join(sam.token(), inviteCode(casey.token()));
		entityManager.clear();

		assertThat(JsonPath.<Object>read(body(get(pat.token(), "/api/tasks/" + taskId)), "$.assigneeId")).isNull();
		assertThat(assigneesByOccurrence(schedule(pat.token(), today, today.plusDays(1)))).hasSize(2)
			.allSatisfy((id, assignee) -> assertThat(assignee).isNull());
	}

	@Test
	void deletingAnAccountUnassignsIt() {
		Member pat = register("pat@example.com", "Pat");
		Member sam = joinHouseholdOf(pat, "sam@example.com", "Sam");
		long taskId = createDailyTask(pat.token(), sam.id());
		assign(pat.token(), occurrenceId(taskId, today), sam.id());

		assertThat(mvc.delete()
			.uri("/api/me")
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + sam.token())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\": \"correct-horse\"}")).hasStatus(204);
		entityManager.clear();

		assertThat(JsonPath.<Object>read(body(get(pat.token(), "/api/tasks/" + taskId)), "$.assigneeId")).isNull();
		assertThat(JsonPath.<Object>read(body(schedule(pat.token(), today, today)), "$.occurrences[0].assigneeId"))
			.isNull();
	}

	/** Each day's assignee id, null for Anyone. */
	private Map<Long, Object> assigneesByOccurrence(MvcTestResult schedule) {
		Map<Long, Object> assignees = new HashMap<>();
		List<Map<String, Object>> rows = JsonPath.read(body(schedule), "$.occurrences[*]");
		rows.forEach(row -> assignees.put(((Number) row.get("id")).longValue(), row.get("assigneeId")));
		return assignees;
	}

	private MvcTestResult assign(String token, long id, Long assigneeId) {
		MvcTestResult result = mvc.put()
			.uri("/api/occurrences/{id}/assignee", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"assigneeId\": %s}".formatted(assigneeId))
			.exchange();
		entityManager.flush();
		entityManager.clear();
		return result;
	}

	private MvcTestResult followTask(String token, long id) {
		MvcTestResult result = mvc.delete()
			.uri("/api/occurrences/{id}/assignee", id)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
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

	private void edit(String token, long taskId, String json) {
		assertThat(mvc.put()
			.uri("/api/tasks/{id}", taskId)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
	}

	private long createDailyTask(String token, Long assigneeId) {
		MvcTestResult result = post(token, "/api/tasks",
				"{\"name\": \"Dishes\", \"frequency\": \"DAILY\", \"assigneeId\": %s}".formatted(assigneeId));
		assertThat(result).hasStatus(201);
		return ((Number) JsonPath.read(body(result), "$.id")).longValue();
	}

	private long occurrenceId(long taskId, LocalDate originalDate) {
		entityManager.flush();
		return jdbc.sql("select id from occurrence where task_id = ? and original_date = ?")
			.params(taskId, originalDate)
			.query(Long.class)
			.single();
	}

	private Member register(String email, String name) {
		MvcTestResult registered = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"password\": \"correct-horse\", \"displayName\": \"%s\"}".formatted(email, name))
			.exchange();
		String token = text(registered, "$.token");
		post(token, "/api/household", "{\"name\": \"Home\", \"timeZone\": \"%s\"}".formatted(ZONE.getId()));
		return new Member(token, number(registered, "$.user.id"));
	}

	private Member joinHouseholdOf(Member owner, String email, String name) {
		Member member = register(email, name);
		join(member.token(), inviteCode(owner.token()));
		return member;
	}

	private void join(String token, String inviteCode) {
		assertThat(post(token, "/api/household/join", "{\"inviteCode\": \"%s\"}".formatted(inviteCode))).hasStatusOk();
		entityManager.flush();
		entityManager.clear();
	}

	private String inviteCode(String token) {
		return text(get(token, "/api/household"), "$.inviteCode");
	}

	private MvcTestResult post(String token, String uri, String json) {
		return mvc.post()
			.uri(uri)
			.header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON)
			.content(json)
			.exchange();
	}

	private MvcTestResult get(String token, String uri) {
		return mvc.get().uri(uri).header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
	}

	private MvcTestResult schedule(String token, LocalDate from, LocalDate to) {
		return get(token, "/api/schedule?from=%s&to=%s".formatted(from, to));
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
