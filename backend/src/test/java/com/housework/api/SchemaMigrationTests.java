package com.housework.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Checks that the Flyway migrations produce a schema whose delete rules
 * support account deletion (BILLIAMVT-41). Each test rolls back.
 */
@IntegrationTest
@Transactional
class SchemaMigrationTests {

	@Autowired
	private JdbcClient jdbc;

	private long householdId;
	private long userId;
	private long taskId;
	private long occurrenceId;

	@BeforeEach
	void createHouseholdWithCompletedTask() {
		householdId = insert("insert into household (name, time_zone, invite_code) values ('Test home', 'America/New_York', 'TESTCODE') returning id");
		userId = insert("insert into app_user (household_id, email, display_name, password_hash) values (?, 'pat@example.com', 'Pat', 'x')"
				+ " returning id", householdId);
		taskId = insert("insert into task (household_id, name, recurrence_rule, starts_on)"
				+ " values (?, 'Vacuum', 'FREQ=WEEKLY;BYDAY=SA', date '2026-10-25')"
				+ " returning id", householdId);
		occurrenceId = insert("insert into occurrence (task_id, original_date, scheduled_date, status, completed_by,"
				+ " completed_at) values (?, date '2026-10-31', date '2026-10-31', 'DONE', ?, now()) returning id", taskId,
				userId);
	}

	@Test
	void migrationsAreApplied() {
		Integer applied = jdbc.sql("select count(*) from flyway_schema_history where success").query(Integer.class)
			.single();
		assertThat(applied).isPositive();
	}

	@Test
	void deletingUserKeepsCompletedOccurrenceButUnlinksIt() {
		jdbc.sql("delete from app_user where id = ?").param(userId).update();

		Long completedBy = jdbc.sql("select completed_by from occurrence where id = ?").param(occurrenceId)
			.query(Long.class)
			.optional()
			.orElse(null);
		String status = jdbc.sql("select status from occurrence where id = ?").param(occurrenceId)
			.query(String.class)
			.single();
		assertThat(completedBy).isNull();
		assertThat(status).isEqualTo("DONE");
	}

	@Test
	void householdCannotBeDeletedWhileItHasMembers() {
		assertThatThrownBy(() -> jdbc.sql("delete from household where id = ?").param(householdId).update())
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void deletingEmptyHouseholdRemovesItsTasksAndOccurrences() {
		jdbc.sql("delete from app_user where id = ?").param(userId).update();
		jdbc.sql("delete from household where id = ?").param(householdId).update();

		assertThat(count("task", taskId)).isZero();
		assertThat(count("occurrence", occurrenceId)).isZero();
	}

	@Test
	void movedOccurrenceStillBlocksDuplicateForItsOriginalDate() {
		jdbc.sql("update occurrence set scheduled_date = date '2026-11-01' where id = ?").param(occurrenceId).update();

		assertThatThrownBy(() -> jdbc
			.sql("insert into occurrence (task_id, original_date, scheduled_date) values (?, date '2026-10-31', date '2026-10-31')")
			.param(taskId)
			.update()).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void emailsMustBeStoredLowercase() {
		assertThatThrownBy(() -> jdbc
			.sql("insert into app_user (email, display_name, password_hash) values ('Pat@Example.com', 'Pat', 'x')")
			.update()).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void emailsAreUnique() {
		assertThatThrownBy(() -> jdbc
			.sql("insert into app_user (email, display_name, password_hash) values ('pat@example.com', 'Pat again', 'x')")
			.update()).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void recurringTaskRequiresStartDate() {
		assertThatThrownBy(() -> jdbc
			.sql("insert into task (household_id, name, recurrence_rule) values (?, 'Mop', 'FREQ=WEEKLY')")
			.param(householdId)
			.update()).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void backlogItemCannotHaveStartDate() {
		assertThatThrownBy(() -> jdbc
			.sql("insert into task (household_id, name, starts_on) values (?, 'Hang shelves', date '2026-11-01')")
			.param(householdId)
			.update()).isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void backlogItemNeedsNoRuleOrStartDate() {
		long backlogId = insert("insert into task (household_id, name) values (?, 'Hang shelves') returning id",
				householdId);
		assertThat(count("task", backlogId)).isOne();
	}

	private long insert(String sql, Object... params) {
		return jdbc.sql(sql).params(params).query(Long.class).single();
	}

	private int count(String table, long id) {
		return jdbc.sql("select count(*) from " + table + " where id = ?").param(id).query(Integer.class).single();
	}

}
