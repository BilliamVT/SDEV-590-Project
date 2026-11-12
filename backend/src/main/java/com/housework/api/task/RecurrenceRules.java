package com.housework.api.task;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import net.fortuna.ical4j.model.Recur;

/**
 * Turns the task form's schedule fields into an RFC 5545 rule, and a rule back into words
 * (decision record 0003). Only the fixed menu in {@link Frequency} can be built, so users
 * never send rule text; ical4j parses every rule as a final check before it's saved.
 */
final class RecurrenceRules {

	static final int MIN_INTERVAL = 2;

	static final int MAX_INTERVAL_DAYS = 90;

	static final int MAX_INTERVAL_WEEKS = 52;

	/** Days 29–31 are left out: a monthly rule skips months that don't have them. -1 is the last day. */
	static final int MAX_DAY_OF_MONTH = 28;

	static final int LAST_DAY_OF_MONTH = -1;

	/** Sunday first, like the week view. */
	private static final Comparator<DayOfWeek> SUNDAY_FIRST = Comparator.comparingInt(day -> day.getValue() % 7);

	private RecurrenceRules() {
	}

	/** The chosen days without duplicates, Sunday first; null if none were chosen. */
	static List<DayOfWeek> sorted(Collection<DayOfWeek> days) {
		return days == null || days.isEmpty() ? null : days.stream().distinct().sorted(SUNDAY_FIRST).toList();
	}

	/**
	 * The rule for a schedule. {@code startsOn} is only used for quarterly rules, which repeat
	 * on its day of the month (the last day if it's after the 28th).
	 */
	static String build(Frequency frequency, Integer interval, Collection<DayOfWeek> daysOfWeek, Integer dayOfMonth,
			LocalDate startsOn) {
		String rule = switch (frequency) {
			case DAILY -> "FREQ=DAILY";
			case WEEKLY -> "FREQ=WEEKLY;BYDAY=" + byDays(daysOfWeek);
			case EVERY_N_DAYS -> "FREQ=DAILY;INTERVAL=" + interval(interval, MAX_INTERVAL_DAYS, "days");
			// WKST=SU: weeks run Sunday to Saturday like the week view. Without it, ical4j uses the
			// server's locale, which would change which days share a week (BILLIAMVT-50).
			case EVERY_N_WEEKS -> "FREQ=WEEKLY;INTERVAL=" + interval(interval, MAX_INTERVAL_WEEKS, "weeks")
					+ ";WKST=SU;BYDAY=" + byDays(daysOfWeek);
			case MONTHLY -> "FREQ=MONTHLY;BYMONTHDAY=" + dayOfMonth(dayOfMonth);
			case QUARTERLY -> "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY="
					+ (startsOn.getDayOfMonth() > MAX_DAY_OF_MONTH ? LAST_DAY_OF_MONTH : startsOn.getDayOfMonth());
		};
		try {
			new Recur<LocalDate>(rule);
		}
		catch (IllegalArgumentException ex) {
			throw new IllegalStateException("Built an invalid rule: " + rule, ex);
		}
		return rule;
	}

	/** The menu fields a rule was built from, to fill in the edit form (BILLIAMVT-22). */
	record MenuChoice(Frequency frequency, Integer interval, List<DayOfWeek> daysOfWeek, Integer dayOfMonth) {
	}

	/** Reads a rule from {@link #build} back into its menu fields. */
	static MenuChoice parse(String rule) {
		Map<String, String> parts = parts(rule);
		Integer interval = parts.containsKey("INTERVAL") ? Integer.valueOf(parts.get("INTERVAL")) : null;
		List<DayOfWeek> days = parts.containsKey("BYDAY") ? daysOf(parts.get("BYDAY")) : null;
		Integer dayOfMonth = parts.containsKey("BYMONTHDAY") ? Integer.valueOf(parts.get("BYMONTHDAY")) : null;
		return switch (parts.get("FREQ")) {
			case "DAILY" -> interval == null ? new MenuChoice(Frequency.DAILY, null, null, null)
					: new MenuChoice(Frequency.EVERY_N_DAYS, interval, null, null);
			case "WEEKLY" -> interval == null ? new MenuChoice(Frequency.WEEKLY, null, days, null)
					: new MenuChoice(Frequency.EVERY_N_WEEKS, interval, days, null);
			case "MONTHLY" -> interval == null ? new MenuChoice(Frequency.MONTHLY, null, null, dayOfMonth)
					: new MenuChoice(Frequency.QUARTERLY, null, null, null);
			default -> throw new IllegalArgumentException("Not a rule from the task menu: " + rule);
		};
	}

	/** A rule from {@link #build} in words, e.g. "Every 2 weeks on Saturday" or "Every week on Monday and Thursday". */
	static String describe(String rule) {
		Map<String, String> parts = parts(rule);
		int interval = Integer.parseInt(parts.getOrDefault("INTERVAL", "1"));
		String day = parts.containsKey("BYDAY") ? " on " + dayNames(daysOf(parts.get("BYDAY"))) : "";
		return switch (parts.get("FREQ")) {
			case "DAILY" -> interval == 1 ? "Every day" : "Every " + interval + " days";
			case "WEEKLY" -> (interval == 1 ? "Every week" : "Every " + interval + " weeks") + day;
			case "MONTHLY" -> (interval == 1 ? "Every month" : "Every " + interval + " months") + " on the "
					+ dayOfMonthName(Integer.parseInt(parts.get("BYMONTHDAY")));
			default -> throw new IllegalArgumentException("Not a rule from the task menu: " + rule);
		};
	}

	private static Map<String, String> parts(String rule) {
		Map<String, String> parts = new HashMap<>();
		for (String part : rule.split(";")) {
			String[] keyValue = part.split("=", 2);
			parts.put(keyValue[0], keyValue[1]);
		}
		return parts;
	}

	/** MONDAY, THURSDAY → MO,TH (Sunday first) */
	private static String byDays(Collection<DayOfWeek> days) {
		List<DayOfWeek> sorted = sorted(days);
		if (sorted == null) {
			throw new InvalidScheduleException("Choose at least one day of the week.");
		}
		return sorted.stream().map(RecurrenceRules::byDay).collect(Collectors.joining(","));
	}

	private static int interval(Integer interval, int max, String unit) {
		if (interval == null || interval < MIN_INTERVAL || interval > max) {
			throw new InvalidScheduleException("Repeat every %d to %d %s.".formatted(MIN_INTERVAL, max, unit));
		}
		return interval;
	}

	private static int dayOfMonth(Integer dayOfMonth) {
		if (dayOfMonth == null
				|| (dayOfMonth != LAST_DAY_OF_MONTH && (dayOfMonth < 1 || dayOfMonth > MAX_DAY_OF_MONTH))) {
			throw new InvalidScheduleException("Choose a day from 1 to 28, or the last day of the month.");
		}
		return dayOfMonth;
	}

	/** SATURDAY → SA */
	private static String byDay(DayOfWeek day) {
		return day.name().substring(0, 2);
	}

	/** MO,TH → [MONDAY, THURSDAY] */
	private static List<DayOfWeek> daysOf(String byDay) {
		return sorted(Arrays.stream(byDay.split(",")).map(RecurrenceRules::dayOf).toList());
	}

	/** Saturday; Monday and Thursday; Sun, Mon, Wed (three or more are shortened) */
	private static String dayNames(List<DayOfWeek> days) {
		if (days.size() == 1) {
			return days.getFirst().getDisplayName(TextStyle.FULL, Locale.ENGLISH);
		}
		if (days.size() == 2) {
			return days.get(0).getDisplayName(TextStyle.FULL, Locale.ENGLISH) + " and "
					+ days.get(1).getDisplayName(TextStyle.FULL, Locale.ENGLISH);
		}
		return days.stream().map(day -> day.getDisplayName(TextStyle.SHORT, Locale.ENGLISH)).collect(Collectors.joining(", "));
	}

	/** SA → SATURDAY */
	private static DayOfWeek dayOf(String byDay) {
		for (DayOfWeek day : DayOfWeek.values()) {
			if (byDay(day).equals(byDay)) {
				return day;
			}
		}
		throw new IllegalArgumentException("Unknown day: " + byDay);
	}

	/** 1 → 1st, 22 → 22nd, -1 → last day */
	private static String dayOfMonthName(int day) {
		if (day == LAST_DAY_OF_MONTH) {
			return "last day";
		}
		String suffix = (day >= 11 && day <= 13) ? "th" : switch (day % 10) {
			case 1 -> "st";
			case 2 -> "nd";
			case 3 -> "rd";
			default -> "th";
		};
		return day + suffix;
	}

}
