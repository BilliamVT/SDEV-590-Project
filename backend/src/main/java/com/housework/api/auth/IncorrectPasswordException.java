package com.housework.api.auth;

/**
 * The password given to confirm a sensitive action is wrong (403). Not 401: the user is still
 * logged in, and the front end treats 401 as "session over" and logs out.
 */
public class IncorrectPasswordException extends RuntimeException {

	IncorrectPasswordException() {
		super("Password is incorrect");
	}

}
