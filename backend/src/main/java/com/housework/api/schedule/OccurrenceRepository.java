package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.List;

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

	/**
	 * A household's occurrences in a date range, by date and then task name (decision record 0005).
	 * Deleted tasks' occurrences are included: they're history (BILLIAMVT-22).
	 */
	@Query("""
			select new com.housework.api.schedule.ScheduleDtos$ScheduledOccurrence(
			    o.id, t.id, t.name, o.scheduledDate, o.originalDate, o.status, t.estimatedMinutes,
			    case when t.deletedAt is null then false else true end)
			from Occurrence o, Task t
			where t.id = o.taskId and t.householdId = :householdId
			  and o.scheduledDate between :from and :to
			order by o.scheduledDate, t.name, o.id""")
	List<ScheduledOccurrence> findSchedule(@Param("householdId") long householdId, @Param("from") LocalDate from,
			@Param("to") LocalDate to);

}
