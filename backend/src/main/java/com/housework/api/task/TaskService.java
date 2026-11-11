package com.housework.api.task;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
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
		LocalDate today = today(household);
		Schedule schedule = schedule(request, today);
		Task task = tasks.save(new Task(household.getId(), request.name().strip(), schedule.rule(), schedule.startsOn(),
				request.estimatedMinutes()));
		log.info("User {} created task {} in household {}", userId, task.getId(), household.getId());
		// Ready before anyone opens the schedule (BILLIAMVT-38)
		this.schedule.generateAhead(task, today);
		return TaskResponse.from(task);
	}

	/** The household's tasks by name, paused ones included; deleted ones aren't (BILLIAMVT-22). */
	@Transactional(readOnly = true)
	public List<TaskResponse> list(long userId) {
		Household household = households.householdOf(userId);
		return tasks.findAllByHouseholdIdAndDeletedAtIsNullOrderByNameAscIdAsc(household.getId())
			.stream()
			.map(TaskResponse::from)
			.toList();
	}

	@Transactional(readOnly = true)
	public TaskResponse get(long userId, long taskId) {
		return TaskResponse.from(task(households.householdOf(userId), taskId));
	}

	/**
	 * Edits a task. A changed schedule applies from today: future occurrences that are still
	 * pending and unmoved are replaced; past, done, skipped and moved ones are kept.
	 */
	@Transactional
	public TaskResponse update(long userId, long taskId, CreateTaskRequest request) {
		Household household = households.householdOf(userId);
		Task task = task(household, taskId);
		LocalDate today = today(household);
		task.rename(request.name().strip(), request.estimatedMinutes());
		if (scheduleChanged(task, request)) {
			Schedule schedule = schedule(request, today);
			task.reschedule(schedule.rule(), schedule.startsOn());
			this.schedule.regenerate(task, today);
		}
		log.info("User {} edited task {}", userId, task.getId());
		return TaskResponse.from(task);
	}

	/** Paused tasks get no new occurrences; their future pending ones are removed. */
	@Transactional
	public TaskResponse pause(long userId, long taskId) {
		Household household = households.householdOf(userId);
		Task task = task(household, taskId);
		task.pause();
		schedule.regenerate(task, today(household));
		log.info("User {} paused task {}", userId, task.getId());
		return TaskResponse.from(task);
	}

	/** Back on its original rule and start date, from today on; the paused days aren't filled in. */
	@Transactional
	public TaskResponse resume(long userId, long taskId) {
		Household household = households.householdOf(userId);
		Task task = task(household, taskId);
		task.resume();
		schedule.resume(task, today(household));
		log.info("User {} resumed task {}", userId, task.getId());
		return TaskResponse.from(task);
	}

	/** Soft delete: past occurrences stay as history; upcoming pending ones are removed. */
	@Transactional
	public void delete(long userId, long taskId) {
		Household household = households.householdOf(userId);
		Task task = task(household, taskId);
		task.delete(Instant.now(clock));
		schedule.removeUpcoming(task, today(household));
		log.info("User {} deleted task {}", userId, task.getId());
	}

	private Task task(Household household, long taskId) {
		return tasks.findByIdAndHouseholdIdAndDeletedAtIsNull(taskId, household.getId())
			.orElseThrow(TaskNotFoundException::new);
	}

	private LocalDate today(Household household) {
		return LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
	}

	private record Schedule(String rule, LocalDate startsOn) {
	}

	/** The rule and start date for the form's schedule fields; checks a chosen start date. */
	private static Schedule schedule(CreateTaskRequest request, LocalDate today) {
		LocalDate startsOn = startsOn(request, today);
		String rule = RecurrenceRules.build(request.frequency(), request.interval(), request.daysOfWeek(),
				request.dayOfMonth(), startsOn);
		if (request.frequency() == Frequency.EVERY_N_WEEKS) {
			// Start the cycle on the first chosen weekday on or after the start date. Otherwise RFC 5545
			// counts weeks from the start date's week and can skip its weekday, e.g. "every 2 weeks on
			// Sunday" chosen on a Wednesday would first fall 11 days later instead of 4.
			LocalDate from = startsOn;
			startsOn = request.daysOfWeek()
				.stream()
				.map(day -> from.with(TemporalAdjusters.nextOrSame(day)))
				.min(LocalDate::compareTo)
				.orElseThrow();
		}
		return new Schedule(rule, startsOn);
	}

	/**
	 * Whether an edit changes the schedule. The form sends the task's current fields back, so an
	 * unchanged schedule (even one that started in the past) is left alone.
	 */
	private static boolean scheduleChanged(Task task, CreateTaskRequest request) {
		RecurrenceRules.MenuChoice current = RecurrenceRules.parse(task.getRecurrenceRule());
		boolean chosenStart = CHOSEN_START.contains(request.frequency());
		return current.frequency() != request.frequency()
				|| (current.interval() != null && !current.interval().equals(request.interval()))
				|| (current.daysOfWeek() != null
						&& !current.daysOfWeek().equals(RecurrenceRules.sorted(request.daysOfWeek())))
				|| (current.dayOfMonth() != null && !current.dayOfMonth().equals(request.dayOfMonth()))
				|| (chosenStart && !Objects.equals(request.startsOn(), task.getStartsOn()));
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
