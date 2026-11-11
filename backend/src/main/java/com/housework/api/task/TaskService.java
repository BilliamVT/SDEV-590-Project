package com.housework.api.task;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.Household;
import com.housework.api.household.HouseholdService;
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

	/** How far from today a chosen start date may be. */
	private static final int MAX_START_YEARS = 1;

	private final TaskRepository tasks;

	private final HouseholdService households;

	private final Clock clock;

	TaskService(TaskRepository tasks, HouseholdService households, Clock clock) {
		this.tasks = tasks;
		this.households = households;
		this.clock = clock;
	}

	@Transactional
	public TaskResponse create(long userId, CreateTaskRequest request) {
		Household household = households.householdOf(userId);
		LocalDate today = LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
		LocalDate startsOn = startsOn(request, today);
		String rule = RecurrenceRules.build(request.frequency(), request.interval(), request.dayOfWeek(),
				request.dayOfMonth(), startsOn);
		Task task = tasks.save(
				new Task(household.getId(), request.name().strip(), rule, startsOn, request.estimatedMinutes()));
		log.info("User {} created task {} in household {}", userId, task.getId(), household.getId());
		return TaskResponse.from(task);
	}

	private static LocalDate startsOn(CreateTaskRequest request, LocalDate today) {
		if (!CHOSEN_START.contains(request.frequency()) || request.startsOn() == null) {
			return today;
		}
		LocalDate chosen = request.startsOn();
		if (chosen.isBefore(today.minusYears(MAX_START_YEARS)) || chosen.isAfter(today.plusYears(MAX_START_YEARS))) {
			throw new InvalidScheduleException("Choose a start date within a year of today.");
		}
		return chosen;
	}

}
