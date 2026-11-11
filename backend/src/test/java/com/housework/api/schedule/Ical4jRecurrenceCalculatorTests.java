package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/** The cases from decision record 0003's comparison, plus the rules BILLIAMVT-21 builds. */
class Ical4jRecurrenceCalculatorTests {

	private final RecurrenceCalculator calculator = new Ical4jRecurrenceCalculator();

	@ParameterizedTest(name = "{0} from {1}, {2} to {3}")
	@CsvSource(delimiter = '|', textBlock = """
			FREQ=WEEKLY;BYDAY=SA                   | 2026-10-28 | 2026-11-01 | 2026-11-30 | 2026-11-07 2026-11-14 2026-11-21 2026-11-28
			FREQ=DAILY                             | 2026-10-28 | 2026-11-01 | 2026-11-05 | 2026-11-01 2026-11-02 2026-11-03 2026-11-04 2026-11-05
			FREQ=WEEKLY;INTERVAL=2;BYDAY=SA        | 2026-10-28 | 2026-11-01 | 2026-12-31 | 2026-11-14 2026-11-28 2026-12-12 2026-12-26
			FREQ=DAILY;INTERVAL=10                 | 2026-10-28 | 2026-11-01 | 2026-12-15 | 2026-11-07 2026-11-17 2026-11-27 2026-12-07
			FREQ=MONTHLY;INTERVAL=3                | 2026-11-15 | 2026-11-01 | 2027-12-31 | 2026-11-15 2027-02-15 2027-05-15 2027-08-15 2027-11-15
			FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15  | 2026-11-15 | 2026-11-01 | 2027-12-31 | 2026-11-15 2027-02-15 2027-05-15 2027-08-15 2027-11-15
			FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1  | 2026-10-31 | 2026-11-01 | 2027-08-31 | 2027-01-31 2027-04-30 2027-07-31
			FREQ=MONTHLY;BYMONTHDAY=15             | 2026-10-28 | 2026-11-01 | 2027-01-31 | 2026-11-15 2026-12-15 2027-01-15
			FREQ=MONTHLY;BYMONTHDAY=-1             | 2026-10-31 | 2026-11-01 | 2027-03-31 | 2026-11-30 2026-12-31 2027-01-31 2027-02-28 2027-03-31
			FREQ=WEEKLY;BYDAY=SA                   | 2026-10-28 | 2026-10-25 | 2026-11-08 | 2026-10-31 2026-11-07
			FREQ=WEEKLY;BYDAY=SA                   | 2026-10-28 | 2027-03-01 | 2027-03-31 | 2027-03-06 2027-03-13 2027-03-20 2027-03-27
			FREQ=DAILY                             | 2026-10-28 | 2026-11-05 | 2026-11-04 |
			""")
	void datesBetween(String rule, LocalDate startsOn, LocalDate from, LocalDate to, String expected) {
		List<LocalDate> dates = expected == null ? List.of()
				: Arrays.stream(expected.split(" ")).map(LocalDate::parse).toList();

		assertThat(calculator.datesBetween(rule, startsOn, from, to)).containsExactlyElementsOf(dates);
	}

}
