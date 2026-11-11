package com.housework.api.task;

/** No such task in the user's household, or it was deleted (404, decision record 0005). */
public class TaskNotFoundException extends RuntimeException {

	TaskNotFoundException() {
		super("Task not found");
	}

}
