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

	/** A one-off item has no schedule fields: it waits in the backlog until it's put on a day. */
	public record CreateItemRequest(@NotBlank @Size(max = 100) String name,
			/** Optional; up to a full day */
			@Min(1) @Max(1440) Integer estimatedMinutes) {
	}

	/** The day to schedule an item on, or the day it was done. */
	public record DayRequest(@NotNull LocalDate date) {
	}

	public record ItemResponse(Long id, String name, Integer estimatedMinutes) {

		static ItemResponse from(Task task) {
			return new ItemResponse(task.getId(), task.getName(), task.getEstimatedMinutes());
		}

	}

}
