package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.List;

/**
 * The dates a recurrence rule produces. Scheduling code and its tests depend on this, not on
 * the library behind it (decision record 0003), so the library can be swapped in one class.
 */
public interface RecurrenceCalculator {

	/**
	 * Dates from {@code from} to {@code to} (both inclusive) of a rule that starts on
	 * {@code startsOn}. A start date that doesn't match the rule isn't itself a date.
	 */
	List<LocalDate> datesBetween(String rule, LocalDate startsOn, LocalDate from, LocalDate to);

}
