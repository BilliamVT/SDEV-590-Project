package com.housework.api.task;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Recurring tasks have a rule; one-off backlog items don't (V1, BILLIAMVT-23). The task
 * endpoints only see recurring tasks and the backlog endpoints only one-off items.
 */
public interface TaskRepository extends JpaRepository<Task, Long> {

	/** The household's recurring tasks by name, paused ones included (BILLIAMVT-22). */
	@Query("""
			select t from Task t
			where t.householdId = :householdId and t.recurrenceRule is not null and t.deletedAt is null
			order by t.name, t.id""")
	List<Task> findRecurring(@Param("householdId") long householdId);

	/** One recurring task, only if it belongs to the household and isn't deleted (decision record 0005). */
	@Query("""
			select t from Task t
			where t.id = :id and t.householdId = :householdId and t.recurrenceRule is not null
			  and t.deletedAt is null""")
	Optional<Task> findRecurring(@Param("householdId") long householdId, @Param("id") long id);

	/** Tasks that get occurrences: not paused, not deleted. One-off items are skipped by generation. */
	List<Task> findAllByHouseholdIdAndActiveTrueAndDeletedAtIsNull(Long householdId);

	/** Open backlog items: one-off, not deleted, and not on the schedule (nothing pending or done), oldest first. */
	@Query(OPEN_ITEMS + "order by t.id")
	List<Task> findOpenItems(@Param("householdId") long householdId);

	/** One open backlog item in the household (decision record 0005). */
	@Query(OPEN_ITEMS + "and t.id = :id")
	Optional<Task> findOpenItem(@Param("householdId") long householdId, @Param("id") long id);

	/** One backlog item in the household, open or already on a day. */
	@Query("""
			select t from Task t
			where t.id = :id and t.householdId = :householdId and t.recurrenceRule is null
			  and t.deletedAt is null""")
	Optional<Task> findItem(@Param("householdId") long householdId, @Param("id") long id);

	/** A skipped day doesn't take an item off the backlog; a pending or done one does. */
	String OPEN_ITEMS = """
			select t from Task t
			where t.householdId = :householdId and t.recurrenceRule is null and t.deletedAt is null
			  and not exists (
			    select 1 from Occurrence o
			    where o.taskId = t.id and o.status <> com.housework.api.schedule.OccurrenceStatus.SKIPPED)
			""";

}
