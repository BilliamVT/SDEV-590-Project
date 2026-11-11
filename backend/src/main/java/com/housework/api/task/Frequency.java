package com.housework.api.task;

/** The fixed menu of schedules a task can have (decision record 0003). */
public enum Frequency {

	DAILY,

	/** On one day of the week. */
	WEEKLY,

	EVERY_N_DAYS,

	/** Every N weeks on one day of the week. */
	EVERY_N_WEEKS,

	/** On a day of the month (1–28) or the last day. */
	MONTHLY,

	/** Every three months, on the start date's day of the month. */
	QUARTERLY

}
