package com.housework.api.household;

/** Creating a household for a user who already has one (409); use the invite code to switch. */
public class AlreadyInHouseholdException extends RuntimeException {

	AlreadyInHouseholdException() {
		super("You already belong to a household");
	}

}
