package com.housework.api.task;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.EnumSet;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.Household;
import com.housework.api.household.HouseholdService;
import com.housework.api.schedule.ScheduleGenerator;
import com.housework.api.task.TaskDtos.CreateTaskRequest;
import com.housework.api.task.TaskDtos.TaskResponse;

/**
 * The household's tasks. Tasks always belong to the logged-in user's household; nothing here
 * takes a household ID from the request (decision record 0005). Logs by ID only.
 */
@Service
public class TaskService {

	private static final Logger log = LoggerFactory.getLogger(TaskService.class);

	/** Frequencies whose start date the user picks; the others start today. */
	private static final Set<Frequency> CHOSEN_START = EnumSet.of(Frequency.EVERY_N_DAYS, Frequency.EVERY_N_WEEKS,
			Frequency.QUARTERLY);

	/** How far ahead a chosen start date may be. */
	private static final int MAX_START_YEARS = 1;

	private final TaskRepository tasks;

	private final HouseholdService households;

	private final ScheduleGenerator schedule;

	private final Clock clock;

	TaskService(TaskRepository tasks, HouseholdService households, ScheduleGenerator schedule, Clock clock) {
		this.tasks = tasks;
		this.households = households;
		this.schedule = schedule;
		this.clock = clock;
	}

	@Transactional
	public TaskResponse create(long userId, CreateTaskRequest request) {
		Household household = households.householdOf(userId);
		LocalDate today = LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
		LocalDate startsOn = startsOn(request, today);
		String rule = RecurrenceRules.build(request.frequency(), request.interval(), request.dayOfWeek(),
				request.dayOfMonth(), startsOn);
		if (request.frequency() == Frequency.EVERY_N_WEEKS) {
			// Start the cycle on the first chosen weekday on or after the start date. Otherwise RFC 5545
			// counts weeks from the start date's week and can skip its weekday, e.g. "every 2 weeks on
			// Sunday" chosen on a Wednesday would first fall 11 days later instead of 4.
			startsOn = startsOn.with(TemporalAdjusters.nextOrSame(request.dayOfWeek()));
		}
		Task task = tasks.save(
				new Task(household.getId(), request.name().strip(), rule, startsOn, request.estimatedMinutes()));
		log.info("User {} created task {} in household {}", userId, task.getId(), household.getId());
		// Ready before anyone opens the schedule (BILLIAMVT-38)
		schedule.generateAhead(task, today);
		return TaskResponse.from(task);
	}

	private static LocalDate startsOn(CreateTaskRequest request, LocalDate today) {
		if (!CHOSEN_START.contains(request.frequency()) || request.startsOn() == null) {
			return today;
		}
		LocalDate chosen = request.startsOn();
		// The start date is the first time it's due. A past one would put overdue items on the
		// schedule as soon as the task is saved.
		if (chosen.isBefore(today)) {
			throw new InvalidScheduleException("Choose a start date from today on.");
		}
		if (chosen.isAfter(today.plusYears(MAX_START_YEARS))) {
			throw new InvalidScheduleException("Choose a start date within a year of today.");
		}
		return chosen;
	}

}
