package com.housework.api.task;

import java.time.LocalDate;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Request and response bodies for /api/backlog (BILLIAMVT-23). */
public final class BacklogDtos {

	private BacklogDtos() {
	}

	/**
	 * A one-off item has no schedule fields: it waits in the backlog until it's put on a day. With a
	 * date, it goes straight onto that day instead (BILLIAMVT-59), as if added and then scheduled.
	 */
	public record CreateItemRequest(@NotBlank @Size(max = 100) String name,
			/** Optional; up to a full day */
			@Min(1) @Max(1440) Integer estimatedMinutes,
			/** Optional; today (the household's) up to 2 years ahead */
			LocalDate date,
			/** A household member, or null for Anyone (BILLIAMVT-64) */
			Long assigneeId) {
	}

	/** The day to schedule an item on, or the day it was done. */
	public record DayRequest(@NotNull LocalDate date) {
	}

	/** PUT /api/backlog/{id}/assignee: a household member, or null for Anyone (BILLIAMVT-64). */
	public record AssignRequest(Long assigneeId) {
	}

	/** {@code assigneeId}: who the item is for, null for Anyone; its day follows it once scheduled (BILLIAMVT-64). */
	public record ItemResponse(Long id, String name, Integer estimatedMinutes, Long assigneeId) {

		static ItemResponse from(Task task) {
			return new ItemResponse(task.getId(), task.getName(), task.getEstimatedMinutes(), task.getAssignedTo());
		}

	}

}
