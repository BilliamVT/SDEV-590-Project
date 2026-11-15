package com.housework.api.schedule;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.Clock;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.feature.FeatureFlags;
import com.housework.api.household.Household;
import com.housework.api.household.HouseholdService;
import com.housework.api.schedule.ScheduleDtos.OccurrenceResponse;
import com.housework.api.schedule.ScheduleDtos.ScheduleResponse;
import com.housework.api.task.Task;
import com.housework.api.task.TaskRepository;

/** The household's schedule for a date range, generated as needed (decision record 0005: own household only). */
@Service
public class ScheduleService {

	private static final Logger log = LoggerFactory.getLogger(ScheduleService.class);

	/** Longest range one request may ask for. */
	static final int MAX_RANGE_DAYS = 42;

	/** How far ahead the schedule can be viewed; bounds how much one request can generate. */
	static final int MAX_YEARS_AHEAD = 2;

	private final HouseholdService households;

	private final TaskRepository tasks;

	private final OccurrenceRepository occurrences;

	private final ScheduleGenerator generator;

	private final FeatureFlags flags;

	private final Clock clock;

	ScheduleService(HouseholdService households, TaskRepository tasks, OccurrenceRepository occurrences,
			ScheduleGenerator generator, FeatureFlags flags, Clock clock) {
		this.households = households;
		this.tasks = tasks;
		this.occurrences = occurrences;
		this.generator = generator;
		this.flags = flags;
		this.clock = clock;
	}

	/** Writes as well as reads: generation fills in whatever the range needs (idempotent). */
	@Transactional
	public ScheduleResponse schedule(long userId, LocalDate from, LocalDate to) {
		Household household = households.householdOf(userId);
		LocalDate today = today(household);
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

	/**
	 * Marks an occurrence done or skipped, or back to pending (undo). Any date, and deleted tasks'
	 * occurrences too: the household decides what's true (BILLIAMVT-25).
	 */
	@Transactional
	public OccurrenceResponse changeStatus(long userId, long occurrenceId, OccurrenceStatus status) {
		Household household = households.householdOf(userId);
		Occurrence occurrence = occurrences.findByIdAndHouseholdId(occurrenceId, household.getId())
			.orElseThrow(OccurrenceNotFoundException::new);
		OccurrenceStatus previous = occurrence.getStatus();
		occurrence.changeStatus(status, userId, Instant.now(clock));
		occurrences.flush();
		log.info("User {} changed occurrence {} from {} to {}", userId, occurrenceId, previous, status);
		return occurrences.findScheduled(household.getId(), occurrenceId)
			.map(row -> OccurrenceResponse.from(row, today(household)))
			.orElseThrow(OccurrenceNotFoundException::new);
	}

	/**
	 * Moves one pending occurrence to another day, from the household's today up to 2 years ahead,
	 * as far as the schedule can be viewed (BILLIAMVT-27). Beyond the generated weeks is fine:
	 * generation keys on the original date, so the moved day is never duplicated. The task's rule doesn't change: its other days stay put,
	 * and editing, pausing or regenerating the task keeps the move (deleteReplaceable skips moved
	 * days). Moving it back to its original date makes it a normal day again. The same task may
	 * already be on the new day (e.g. a daily task); both show.
	 */
	@Transactional
	public OccurrenceResponse move(long userId, long occurrenceId, LocalDate date) {
		flags.requireDragDrop();
		Household household = households.householdOf(userId);
		Occurrence occurrence = occurrences.findByIdAndHouseholdId(occurrenceId, household.getId())
			.orElseThrow(OccurrenceNotFoundException::new);
		if (occurrence.getStatus() != OccurrenceStatus.PENDING) {
			throw new OccurrenceNotMovableException("Only a day that isn't done or skipped can be moved.");
		}
		Task task = tasks.findById(occurrence.getTaskId()).orElseThrow(OccurrenceNotFoundException::new);
		if (task.isDeleted()) {
			throw new OccurrenceNotMovableException("This task was deleted, so its days can't be moved.");
		}
		LocalDate today = today(household);
		if (date.isBefore(today)) {
			throw new InvalidMoveException("Pick today or a later day.");
		}
		if (date.isAfter(today.plusYears(MAX_YEARS_AHEAD))) {
			throw new InvalidMoveException("Pick a day up to 2 years ahead.");
		}
		LocalDate previous = occurrence.getScheduledDate();
		occurrence.moveTo(date);
		occurrences.flush();
		log.info("User {} moved occurrence {} of task {} from {} to {}", userId, occurrenceId, task.getId(), previous,
				date);
		return occurrences.findScheduled(household.getId(), occurrenceId)
			.map(row -> OccurrenceResponse.from(row, today))
			.orElseThrow(OccurrenceNotFoundException::new);
	}

	/**
	 * Deletes one occurrence for good, whatever its status or task (BILLIAMVT-25). Nothing records
	 * the deletion, so editing a still-active task's schedule may regenerate an upcoming day.
	 */
	@Transactional
	public void deleteOccurrence(long userId, long occurrenceId) {
		Household household = households.householdOf(userId);
		Occurrence occurrence = occurrences.findByIdAndHouseholdId(occurrenceId, household.getId())
			.orElseThrow(OccurrenceNotFoundException::new);
		occurrences.delete(occurrence);
		log.info("User {} deleted occurrence {} of task {}", userId, occurrenceId, occurrence.getTaskId());
	}

	private LocalDate today(Household household) {
		return LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
	}

}
