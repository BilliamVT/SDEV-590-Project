package com.housework.api.schedule;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.Clock;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.Household;
import com.housework.api.household.HouseholdService;
import com.housework.api.schedule.ScheduleDtos.OccurrenceResponse;
import com.housework.api.schedule.ScheduleDtos.ScheduleResponse;
import com.housework.api.task.Task;
import com.housework.api.task.TaskRepository;

/** The household's schedule for a date range, generated as needed (decision record 0005: own household only). */
@Service
public class ScheduleService {

	/** Longest range one request may ask for. */
	static final int MAX_RANGE_DAYS = 42;

	/** How far ahead the schedule can be viewed; bounds how much one request can generate. */
	static final int MAX_YEARS_AHEAD = 2;

	private final HouseholdService households;

	private final TaskRepository tasks;

	private final OccurrenceRepository occurrences;

	private final ScheduleGenerator generator;

	private final Clock clock;

	ScheduleService(HouseholdService households, TaskRepository tasks, OccurrenceRepository occurrences,
			ScheduleGenerator generator, Clock clock) {
		this.households = households;
		this.tasks = tasks;
		this.occurrences = occurrences;
		this.generator = generator;
		this.clock = clock;
	}

	/** Writes as well as reads: generation fills in whatever the range needs (idempotent). */
	@Transactional
	public ScheduleResponse schedule(long userId, LocalDate from, LocalDate to) {
		Household household = households.householdOf(userId);
		LocalDate today = LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
		LocalDate lastViewable = today.plusYears(MAX_YEARS_AHEAD);
		if (to.isBefore(from)) {
			throw new InvalidRangeException("The end date must be on or after the start date.");
		}
		if (ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
			throw new InvalidRangeException("View at most 6 weeks at a time.");
		}
		if (to.isAfter(lastViewable)) {
			throw new InvalidRangeException("You can view the schedule up to 2 years ahead.");
		}
		LocalDate target = generator.aheadOf(today).isAfter(to) ? generator.aheadOf(today) : to;
		for (Task task : tasks.findAllByHouseholdIdAndActiveTrueAndDeletedAtIsNull(household.getId())) {
			generator.generateThrough(task, target);
		}
		var rows = occurrences.findSchedule(household.getId(), from, to)
			.stream()
			.map(row -> OccurrenceResponse.from(row, today))
			.toList();
		return new ScheduleResponse(from, to, today, lastViewable, rows);
	}

}
