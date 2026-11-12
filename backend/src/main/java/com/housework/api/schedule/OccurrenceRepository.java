package com.housework.api.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.housework.api.schedule.ScheduleDtos.ScheduledOccurrence;

public interface OccurrenceRepository extends JpaRepository<Occurrence, Long> {

	/** Idempotent: the (task_id, original_date) constraint (V1) skips dates that already exist. */
	@Modifying
	@Query(value = """
			insert into occurrence (task_id, original_date, scheduled_date)
			values (:taskId, :date, :date)
			on conflict (task_id, original_date) do nothing""", nativeQuery = true)
	int insertIfAbsent(@Param("taskId") long taskId, @Param("date") LocalDate date);

	/**
	 * Puts a one-off backlog item on a day, pending or already done (BILLIAMVT-23). An open item
	 * only has skipped days, so a day it was skipped on before is reused rather than duplicated.
	 */
	@Modifying
	@Query(value = """
			insert into occurrence (task_id, original_date, scheduled_date, status, completed_by, completed_at)
			values (:taskId, :date, :date, :status, :completedBy, :completedAt)
			on conflict (task_id, original_date) do update
			set scheduled_date = excluded.scheduled_date, status = excluded.status,
			    completed_by = excluded.completed_by, completed_at = excluded.completed_at, updated_at = now()""",
			nativeQuery = true)
	void place(@Param("taskId") long taskId, @Param("date") LocalDate date, @Param("status") String status,
			@Param("completedBy") Long completedBy, @Param("completedAt") Instant completedAt);

	/** Future occurrences that are still pending and haven't been moved; the ones regeneration replaces. */
	@Modifying
	@Query(value = """
			delete from occurrence
			where task_id = :taskId and original_date >= :from
			  and status = 'PENDING' and scheduled_date = original_date""", nativeQuery = true)
	int deleteReplaceable(@Param("taskId") long taskId, @Param("from") LocalDate from);

	/** Every future occurrence still pending, moved or not; removed when a task is deleted. */
	@Modifying
	@Query(value = """
			delete from occurrence
			where task_id = :taskId and status = 'PENDING'
			  and (original_date >= :from or scheduled_date >= :from)""", nativeQuery = true)
	int deleteUpcoming(@Param("taskId") long taskId, @Param("from") LocalDate from);

	/** The schedule's row shape: the occurrence, its task, and who completed it (if anyone). */
	String SCHEDULE_ROW = """
			select new com.housework.api.schedule.ScheduleDtos$ScheduledOccurrence(
			    o.id, t.id, t.name, o.scheduledDate, o.originalDate, o.status, t.estimatedMinutes,
			    case when t.deletedAt is null then false else true end, u.displayName, o.completedAt,
			    case when t.recurrenceRule is null then true else false end)
			from Occurrence o
			join Task t on t.id = o.taskId
			left join AppUser u on u.id = o.completedBy
			""";

	/**
	 * A household's occurrences in a date range, by date and then task name (decision record 0005).
	 * Deleted tasks' occurrences are included: they're history (BILLIAMVT-22). One-off items come
	 * after the day's recurring tasks (BILLIAMVT-23).
	 */
	@Query(SCHEDULE_ROW + """
			where t.householdId = :householdId and o.scheduledDate between :from and :to
			order by o.scheduledDate, case when t.recurrenceRule is null then 1 else 0 end, t.name, o.id""")
	List<ScheduledOccurrence> findSchedule(@Param("householdId") long householdId, @Param("from") LocalDate from,
			@Param("to") LocalDate to);

	/** One occurrence as a schedule row, only if it's in the household (decision record 0005). */
	@Query(SCHEDULE_ROW + "where o.id = :id and t.householdId = :householdId")
	Optional<ScheduledOccurrence> findScheduled(@Param("householdId") long householdId, @Param("id") long id);

	/** An occurrence to change, only if it's in the household; deleted tasks' included (BILLIAMVT-25). */
	@Query("""
			select o from Occurrence o, Task t
			where o.id = :id and t.id = o.taskId and t.householdId = :householdId""")
	Optional<Occurrence> findByIdAndHouseholdId(@Param("id") long id, @Param("householdId") long householdId);

}
