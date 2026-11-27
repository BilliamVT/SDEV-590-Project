package com.housework.api.household;

/** The chosen assignee isn't a member of the household (400, BILLIAMVT-64). */
public class InvalidAssigneeException extends RuntimeException {

	InvalidAssigneeException() {
		super("Pick someone in your household.");
	}

}
