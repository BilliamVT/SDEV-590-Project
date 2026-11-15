package com.housework.api.schedule;

/** Only a pending day of a task that still exists can be moved (409, BILLIAMVT-27). */
public class OccurrenceNotMovableException extends RuntimeException {

	OccurrenceNotMovableException(String message) {
		super(message);
	}

}
