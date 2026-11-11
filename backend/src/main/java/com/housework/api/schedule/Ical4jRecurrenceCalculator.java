package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.List;

import net.fortuna.ical4j.model.Recur;
import org.springframework.stereotype.Component;

/** {@link RecurrenceCalculator} using ical4j 4.4.0 (decision record 0003). */
@Component
class Ical4jRecurrenceCalculator implements RecurrenceCalculator {

	@Override
	public List<LocalDate> datesBetween(String rule, LocalDate startsOn, LocalDate from, LocalDate to) {
		if (to.isBefore(from)) {
			return List.of();
		}
		return new Recur<LocalDate>(rule).getDates(startsOn, from, to).stream().sorted().toList();
	}

}
