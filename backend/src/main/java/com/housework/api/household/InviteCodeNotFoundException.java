package com.housework.api.household;

/** No household has the invite code (404). */
public class InviteCodeNotFoundException extends RuntimeException {

	InviteCodeNotFoundException() {
		super("No household has that invite code");
	}

}
