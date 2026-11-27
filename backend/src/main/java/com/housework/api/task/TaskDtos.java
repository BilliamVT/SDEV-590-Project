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
			/** EVERY_N_DAYS, EVERY_N_WEEKS and EVERY_N_MONTHS */
			Integer interval,
			/** WEEKLY and EVERY_N_WEEKS: one or more days (BILLIAMVT-50) */
			List<DayOfWeek> daysOfWeek,
			/** MONTHLY: 1–28, or -1 for the last day */
			Integer dayOfMonth,
			/**
			 * EVERY_N_DAYS, EVERY_N_WEEKS, EVERY_N_MONTHS, YEARLY (and QUARTERLY); defaults to today in the
			 * household's time zone
			 */
			LocalDate startsOn,
			/** Optional; up to a full day */
			@Min(1) @Max(1440) Integer estimatedMinutes,
			/** A household member, or null for Anyone (BILLIAMVT-64) */
			Long assigneeId,
			/** Optional; null for none (BILLIAMVT-65) */
			TaskColor color) {
	}

	/** Includes the menu fields the rule was built from, so the edit form can be filled in. */
	public record TaskResponse(Long id, String name, String recurrenceRule, String schedule, Frequency frequency,
			Integer interval, List<DayOfWeek> daysOfWeek, Integer dayOfMonth, LocalDate startsOn, Integer estimatedMinutes,
			boolean active, LastDone lastDone, Long assigneeId, TaskColor color) {

		/** {@code lastDone} is null if the task has never been done. */
		static TaskResponse from(Task task, LastDone lastDone) {
			RecurrenceRules.MenuChoice choice = RecurrenceRules.parse(task.getRecurrenceRule());
			return new TaskResponse(task.getId(), task.getName(), task.getRecurrenceRule(),
					RecurrenceRules.describe(task.getRecurrenceRule()), choice.frequency(), choice.interval(),
					choice.daysOfWeek(), choice.dayOfMonth(), task.getStartsOn(), task.getEstimatedMinutes(),
					task.isActive(), lastDone, task.getAssignedTo(), task.getColor());
		}

	}

	/**
	 * The latest day the task was done, and by whom (BILLIAMVT-26). {@code byName} is null when
	 * that member has since deleted their account.
	 */
	public record LastDone(LocalDate date, String byName) {
	}

}
