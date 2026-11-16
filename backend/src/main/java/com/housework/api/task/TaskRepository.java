package com.housework.api.task;

import java.util.List;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Recurring tasks have a rule; one-off backlog items don't (V1, BILLIAMVT-23). The task
 * endpoints only see recurring tasks and the backlog endpoints only one-off items.
 * <p>
 * Methods named {@code lock…} load rows to change them and take a row lock (SELECT … FOR UPDATE)
 * until the transaction ends, so two members' simultaneous changes run one after the other
 * instead of overwriting each other (decision record 0007, BILLIAMVT-54). Use them only in
 * writable transactions.
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

	/** One recurring task to change (edit, pause, resume, delete), locked; see the class comment. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Task t
			where t.id = :id and t.householdId = :householdId and t.recurrenceRule is not null
			  and t.deletedAt is null""")
	Optional<Task> lockRecurring(@Param("householdId") long householdId, @Param("id") long id);

	/**
	 * Tasks that get occurrences (not paused, not deleted), locked for generation. A task paused or
	 * deleted while this waits drops out, because Postgres re-checks the conditions on the locked
	 * row. In id order, so two members viewing at once lock them in the same order.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Task t
			where t.householdId = :householdId and t.active = true and t.deletedAt is null
			order by t.id""")
	List<Task> lockScheduled(@Param("householdId") long householdId);

	/** Open backlog items: one-off, not deleted, and not on the schedule (nothing pending or done), oldest first. */
	@Query(OPEN_ITEMS + "order by t.id")
	List<Task> findOpenItems(@Param("householdId") long householdId);

	/**
	 * Whether an item is still on the backlog (nothing pending or done). Ask after {@link #lockItem}:
	 * a fresh query sees a day added by someone else while the lock was waited for.
	 */
	@Query("""
			select count(o) = 0 from Occurrence o
			where o.taskId = :id and o.status <> com.housework.api.schedule.OccurrenceStatus.SKIPPED""")
	boolean isOpenItem(@Param("id") long id);

	/** One backlog item in the household, open or already on a day, locked to change it. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Task t
			where t.id = :id and t.householdId = :householdId and t.recurrenceRule is null
			  and t.deletedAt is null""")
	Optional<Task> lockItem(@Param("householdId") long householdId, @Param("id") long id);

	/** A skipped day doesn't take an item off the backlog; a pending or done one does. */
	String OPEN_ITEMS = """
			select t from Task t
			where t.householdId = :householdId and t.recurrenceRule is null and t.deletedAt is null
			  and not exists (
			    select 1 from Occurrence o
			    where o.taskId = t.id and o.status <> com.housework.api.schedule.OccurrenceStatus.SKIPPED)
			""";

}
