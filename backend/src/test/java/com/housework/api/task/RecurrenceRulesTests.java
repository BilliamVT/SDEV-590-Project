package com.housework.api.task;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;

import net.fortuna.ical4j.model.Recur;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecurrenceRulesTests {

	private static final LocalDate START = LocalDate.of(2026, 11, 4);

	@ParameterizedTest
	@CsvSource(delimiter = '|', textBlock = """
			DAILY         |    |          |    | FREQ=DAILY                          | Every day
			WEEKLY        |    | SATURDAY |    | FREQ=WEEKLY;BYDAY=SA                | Every week on Saturday
			EVERY_N_DAYS  | 3  |          |    | FREQ=DAILY;INTERVAL=3               | Every 3 days
			EVERY_N_WEEKS | 2  | MONDAY   |    | FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO | Every 2 weeks on Monday
			MONTHLY       |    |          | 15 | FREQ=MONTHLY;BYMONTHDAY=15          | Every month on the 15th
			MONTHLY       |    |          | 1  | FREQ=MONTHLY;BYMONTHDAY=1           | Every month on the 1st
			MONTHLY       |    |          | 22 | FREQ=MONTHLY;BYMONTHDAY=22          | Every month on the 22nd
			MONTHLY       |    |          | 11 | FREQ=MONTHLY;BYMONTHDAY=11          | Every month on the 11th
			MONTHLY       |    |          | -1 | FREQ=MONTHLY;BYMONTHDAY=-1          | Every month on the last day
			QUARTERLY     |    |          |    | FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=4 | Every 3 months on the 4th
			""")
	void buildsAndDescribesEachMenuChoice(Frequency frequency, Integer interval, DayOfWeek dayOfWeek,
			Integer dayOfMonth, String rule, String description) {
		assertThat(RecurrenceRules.build(frequency, interval, days(dayOfWeek), dayOfMonth, START)).isEqualTo(rule);
		assertThat(RecurrenceRules.describe(rule)).isEqualTo(description);
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', textBlock = """
			DAILY         |    |          |
			WEEKLY        |    | SATURDAY |
			EVERY_N_DAYS  | 3  |          |
			EVERY_N_WEEKS | 2  | MONDAY   |
			MONTHLY       |    |          | 15
			MONTHLY       |    |          | -1
			QUARTERLY     |    |          |
			""")
	void readsARuleBackIntoItsMenuChoice(Frequency frequency, Integer interval, DayOfWeek dayOfWeek, Integer dayOfMonth) {
		String rule = RecurrenceRules.build(frequency, interval, days(dayOfWeek), dayOfMonth, START);

		assertThat(RecurrenceRules.parse(rule))
			.isEqualTo(new RecurrenceRules.MenuChoice(frequency, interval, days(dayOfWeek), dayOfMonth));
	}

	@Test
	void quarterlyFromALateDayUsesTheLastDayOfTheMonth() {
		String rule = RecurrenceRules.build(Frequency.QUARTERLY, null, null, null, LocalDate.of(2026, 10, 31));

		assertThat(rule).isEqualTo("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1");
		// No quarter is skipped, including February
		assertThat(new Recur<LocalDate>(rule).getDates(LocalDate.of(2026, 11, 30), LocalDate.of(2026, 11, 1),
				LocalDate.of(2027, 9, 1)))
			.containsExactly(LocalDate.of(2026, 11, 30), LocalDate.of(2027, 2, 28), LocalDate.of(2027, 5, 31),
					LocalDate.of(2027, 8, 31));
	}

	@Test
	void intervalsMustBeWithinTheLimits() {
		assertThat(RecurrenceRules.build(Frequency.EVERY_N_DAYS, 90, null, null, START)).endsWith("INTERVAL=90");
		assertThat(RecurrenceRules.build(Frequency.EVERY_N_WEEKS, 52, List.of(DayOfWeek.SUNDAY), null, START))
			.contains("INTERVAL=52");
		assertInvalid(Frequency.EVERY_N_DAYS, 1, null, null, "Repeat every 2 to 90 days.");
		assertInvalid(Frequency.EVERY_N_DAYS, 91, null, null, "Repeat every 2 to 90 days.");
		assertInvalid(Frequency.EVERY_N_WEEKS, 53, DayOfWeek.SUNDAY, null, "Repeat every 2 to 52 weeks.");
		assertInvalid(Frequency.EVERY_N_DAYS, null, null, null, "Repeat every 2 to 90 days.");
	}

	@Test
	void weeklySchedulesNeedADay() {
		assertInvalid(Frequency.WEEKLY, null, null, null, "Choose at least one day of the week.");
		assertInvalid(Frequency.EVERY_N_WEEKS, 2, null, null, "Choose at least one day of the week.");
		assertThatThrownBy(() -> RecurrenceRules.build(Frequency.WEEKLY, null, List.of(), null, START))
			.isInstanceOf(InvalidScheduleException.class)
			.hasMessage("Choose at least one day of the week.");
	}

	@ParameterizedTest
	@CsvSource(delimiter = '|', textBlock = """
			WEEKLY        |   | THURSDAY MONDAY                        | FREQ=WEEKLY;BYDAY=MO,TH                  | Every week on Monday and Thursday
			WEEKLY        |   | MONDAY WEDNESDAY THURSDAY FRIDAY SUNDAY | FREQ=WEEKLY;BYDAY=SU,MO,WE,TH,FR          | Every week on Sun, Mon, Wed, Thu, Fri
			WEEKLY        |   | SATURDAY SATURDAY                      | FREQ=WEEKLY;BYDAY=SA                     | Every week on Saturday
			EVERY_N_WEEKS | 2 | THURSDAY MONDAY                        | FREQ=WEEKLY;INTERVAL=2;WKST=SU;BYDAY=MO,TH | Every 2 weeks on Monday and Thursday
			""")
	void severalDaysAreSortedSundayFirstAndReadBack(Frequency frequency, Integer interval, String days, String rule,
			String description) {
		List<DayOfWeek> chosen = java.util.Arrays.stream(days.split(" ")).map(DayOfWeek::valueOf).toList();

		assertThat(RecurrenceRules.build(frequency, interval, chosen, null, START)).isEqualTo(rule);
		assertThat(RecurrenceRules.describe(rule)).isEqualTo(description);
		assertThat(RecurrenceRules.parse(rule).daysOfWeek()).isEqualTo(RecurrenceRules.sorted(chosen));
	}

	/** Tasks saved before BILLIAMVT-50 have no WKST; they still open in the edit form. */
	@Test
	void readsEveryNWeeksRulesSavedWithoutAWeekStart() {
		assertThat(RecurrenceRules.parse("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"))
			.isEqualTo(new RecurrenceRules.MenuChoice(Frequency.EVERY_N_WEEKS, 2, List.of(DayOfWeek.MONDAY), null));
		assertThat(RecurrenceRules.describe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO")).isEqualTo("Every 2 weeks on Monday");
	}

	@Test
	void monthlyDaysAre1To28OrTheLastDay() {
		assertInvalid(Frequency.MONTHLY, null, null, 29, "Choose a day from 1 to 28, or the last day of the month.");
		assertInvalid(Frequency.MONTHLY, null, null, 0, "Choose a day from 1 to 28, or the last day of the month.");
		assertInvalid(Frequency.MONTHLY, null, null, -2, "Choose a day from 1 to 28, or the last day of the month.");
		assertInvalid(Frequency.MONTHLY, null, null, null, "Choose a day from 1 to 28, or the last day of the month.");
	}

	@Test
	void everyBuiltRuleIsValidForIcal4j() {
		for (Frequency frequency : Frequency.values()) {
			String rule = RecurrenceRules.build(frequency, 2, List.of(DayOfWeek.FRIDAY), 10, START);
			assertThat(new Recur<LocalDate>(rule).getFrequency()).isNotNull();
		}
	}

	private static List<DayOfWeek> days(DayOfWeek day) {
		return day == null ? null : List.of(day);
	}

	private static void assertInvalid(Frequency frequency, Integer interval, DayOfWeek day, Integer dayOfMonth,
			String message) {
		assertThatThrownBy(() -> RecurrenceRules.build(frequency, interval, days(day), dayOfMonth, START))
			.isInstanceOf(InvalidScheduleException.class)
			.hasMessage(message);
	}

}
