package com.housework.api.schedule;

/** The requested schedule range is backwards, too long, or too far ahead (400). */
public class InvalidRangeException extends RuntimeException {

	InvalidRangeException(String message) {
		super(message);
	}

}
