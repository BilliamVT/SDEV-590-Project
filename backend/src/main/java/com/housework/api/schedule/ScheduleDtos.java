package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.List;

/** Response bodies for /api/schedule. */
public final class ScheduleDtos {

	private ScheduleDtos() {
	}

	/** One row of the schedule query (OccurrenceRepository.findSchedule). */
	public record ScheduledOccurrence(Long id, Long taskId, String taskName, LocalDate date, LocalDate originalDate,
			OccurrenceStatus status, Integer estimatedMinutes) {
	}

	/** {@code overdue}: still pending on a day before the household's today. */
	public record OccurrenceResponse(Long id, Long taskId, String taskName, LocalDate date, LocalDate originalDate,
			OccurrenceStatus status, Integer estimatedMinutes, boolean overdue) {

		static OccurrenceResponse from(ScheduledOccurrence row, LocalDate today) {
			boolean overdue = row.status() == OccurrenceStatus.PENDING && row.date().isBefore(today);
			return new OccurrenceResponse(row.id(), row.taskId(), row.taskName(), row.date(), row.originalDate(),
					row.status(), row.estimatedMinutes(), overdue);
		}

	}

	/**
	 * {@code today} is the household's (its time zone), so the front end marks the same day;
	 * {@code lastViewableDate} is how far ahead the schedule can be viewed.
	 */
	public record ScheduleResponse(LocalDate from, LocalDate to, LocalDate today, LocalDate lastViewableDate,
			List<OccurrenceResponse> occurrences) {
	}

}
