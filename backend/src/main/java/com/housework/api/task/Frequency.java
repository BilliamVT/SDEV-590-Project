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

	/**
	 * Every three months, on the start date's day of the month. Still accepted from older clients;
	 * it's the same rule as EVERY_N_MONTHS with 3, and reads back as that (BILLIAMVT-60).
	 */
	QUARTERLY,

	/** Every N months (2–11), on the start date's day of the month (BILLIAMVT-60). */
	EVERY_N_MONTHS,

	/** Every year on the start date's month and day (BILLIAMVT-60). */
	YEARLY

}
