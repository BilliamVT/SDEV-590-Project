package com.housework.api.schedule;

/** The day is done or skipped, or its task was deleted, so it can't be assigned (409, BILLIAMVT-64). */
public class OccurrenceNotAssignableException extends RuntimeException {

	OccurrenceNotAssignableException(String message) {
		super(message);
	}

}
