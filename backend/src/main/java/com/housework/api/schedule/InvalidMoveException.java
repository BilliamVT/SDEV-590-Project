package com.housework.api.schedule;

/** The new date for a move is in the past or more than 2 years ahead (400, BILLIAMVT-27). */
public class InvalidMoveException extends RuntimeException {

	InvalidMoveException(String message) {
		super(message);
	}

}
