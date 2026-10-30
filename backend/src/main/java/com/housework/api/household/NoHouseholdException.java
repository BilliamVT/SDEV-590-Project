package com.housework.api.household;

/** The user hasn't created or joined a household yet (404). */
public class NoHouseholdException extends RuntimeException {

	NoHouseholdException() {
		super("You don't belong to a household yet");
	}

}
