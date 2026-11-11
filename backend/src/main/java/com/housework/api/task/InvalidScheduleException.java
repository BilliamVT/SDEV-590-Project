package com.housework.api.task;

/** The schedule fields don't describe one of the allowed schedules (400). */
public class InvalidScheduleException extends RuntimeException {

	InvalidScheduleException(String message) {
		super(message);
	}

}
