package com.housework.api.schedule;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.constraints.NotNull;

/** Response bodies for /api/schedule. */
public final class ScheduleDtos {

	private ScheduleDtos() {
	}

	/** One row of the schedule query (OccurrenceRepository.findSchedule). */
	public record ScheduledOccurrence(Long id, Long taskId, String taskName, LocalDate date, LocalDate originalDate,
			OccurrenceStatus status, Integer estimatedMinutes, boolean taskDeleted, String completedByName,
			Instant completedAt, boolean oneOff) {
	}

	/**
	 * {@code overdue}: still pending on a day before the household's today, and its task wasn't
	 * deleted (a deleted task's missed occurrences are history, not to-dos). {@code oneOff}: a
	 * backlog item's day, which can go back to the backlog when deleted (BILLIAMVT-23).
	 */
	public record OccurrenceResponse(Long id, Long taskId, String taskName, LocalDate date, LocalDate originalDate,
			OccurrenceStatus status, Integer estimatedMinutes, boolean overdue, boolean taskDeleted,
			String completedByName, Instant completedAt, boolean oneOff) {

		static OccurrenceResponse from(ScheduledOccurrence row, LocalDate today) {
			boolean overdue = !row.taskDeleted() && row.status() == OccurrenceStatus.PENDING
					&& row.date().isBefore(today);
			return new OccurrenceResponse(row.id(), row.taskId(), row.taskName(), row.date(), row.originalDate(),
					row.status(), row.estimatedMinutes(), overdue, row.taskDeleted(), row.completedByName(),
					row.completedAt(), row.oneOff());
		}

	}

	/** PUT /api/occurrences/{id}/status: DONE, SKIPPED, or PENDING to undo (BILLIAMVT-25). */
	public record StatusRequest(@NotNull OccurrenceStatus status) {
	}

	/**
	 * {@code today} is the household's (its time zone), so the front end marks the same day;
	 * {@code lastViewableDate} is how far ahead the schedule can be viewed.
	 */
	public record ScheduleResponse(LocalDate from, LocalDate to, LocalDate today, LocalDate lastViewableDate,
			List<OccurrenceResponse> occurrences) {
	}

}
