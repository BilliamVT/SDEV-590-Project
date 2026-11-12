package com.housework.api.task;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Request and response bodies for /api/tasks. */
public final class TaskDtos {

	private TaskDtos() {
	}

	/**
	 * The schedule comes as menu fields, never rule text (decision record 0003). Which fields are
	 * needed depends on the frequency; RecurrenceRules checks them.
	 */
	/** Also the body for editing (PUT /api/tasks/{id}). */
	public record CreateTaskRequest(
			@NotBlank @Size(max = 100) String name,
			@NotNull Frequency frequency,
			/** EVERY_N_DAYS and EVERY_N_WEEKS */
			Integer interval,
			/** WEEKLY and EVERY_N_WEEKS: one or more days (BILLIAMVT-50) */
			List<DayOfWeek> daysOfWeek,
			/** MONTHLY: 1–28, or -1 for the last day */
			Integer dayOfMonth,
			/** EVERY_N_DAYS, EVERY_N_WEEKS and QUARTERLY; defaults to today in the household's time zone */
			LocalDate startsOn,
			/** Optional; up to a full day */
			@Min(1) @Max(1440) Integer estimatedMinutes) {
	}

	/** Includes the menu fields the rule was built from, so the edit form can be filled in. */
	public record TaskResponse(Long id, String name, String recurrenceRule, String schedule, Frequency frequency,
			Integer interval, List<DayOfWeek> daysOfWeek, Integer dayOfMonth, LocalDate startsOn, Integer estimatedMinutes,
			boolean active) {

		static TaskResponse from(Task task) {
			RecurrenceRules.MenuChoice choice = RecurrenceRules.parse(task.getRecurrenceRule());
			return new TaskResponse(task.getId(), task.getName(), task.getRecurrenceRule(),
					RecurrenceRules.describe(task.getRecurrenceRule()), choice.frequency(), choice.interval(),
					choice.daysOfWeek(), choice.dayOfMonth(), task.getStartsOn(), task.getEstimatedMinutes(),
					task.isActive());
		}

	}

}
