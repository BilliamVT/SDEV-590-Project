package com.housework.api.task;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.Household;
import com.housework.api.household.HouseholdService;
import com.housework.api.schedule.OccurrenceRepository;
import com.housework.api.schedule.OccurrenceStatus;
import com.housework.api.task.BacklogDtos.CreateItemRequest;
import com.housework.api.task.BacklogDtos.ItemResponse;

/**
 * One-off items, like hanging shelves (BILLIAMVT-23). An item is a task without a rule. It stays
 * in the backlog until it's put on a day, scheduled or done; from then on it's an ordinary
 * occurrence in the week view. Skipping or deleting that day puts it back in the backlog;
 * deleting the item removes it and its days for good.
 * Always the logged-in user's household (decision record 0005). Logs by ID only.
 */
@Service
public class BacklogService {

	private static final Logger log = LoggerFactory.getLogger(BacklogService.class);

	/** The same limit as viewing the schedule, so a scheduled item can always be found. */
	private static final int MAX_YEARS_AHEAD = 2;

	private final TaskRepository tasks;

	private final OccurrenceRepository occurrences;

	private final HouseholdService households;

	private final Clock clock;

	BacklogService(TaskRepository tasks, OccurrenceRepository occurrences, HouseholdService households, Clock clock) {
		this.tasks = tasks;
		this.occurrences = occurrences;
		this.households = households;
		this.clock = clock;
	}

	/** Items not on the schedule, in the order they were added. */
	@Transactional(readOnly = true)
	public List<ItemResponse> list(long userId) {
		Household household = households.householdOf(userId);
		return tasks.findOpenItems(household.getId()).stream().map(ItemResponse::from).toList();
	}

	@Transactional
	public ItemResponse create(long userId, CreateItemRequest request) {
		Household household = households.householdOf(userId);
		Task item = tasks.save(new Task(household.getId(), request.name().strip(), null, null, request.estimatedMinutes()));
		log.info("User {} added backlog item {} in household {}", userId, item.getId(), household.getId());
		return ItemResponse.from(item);
	}

	/** Puts an open item on a day from today on; it leaves the backlog. */
	@Transactional
	public void schedule(long userId, long itemId, LocalDate date) {
		Household household = households.householdOf(userId);
		Task item = openItem(household, itemId);
		LocalDate today = today(household);
		if (date.isBefore(today)) {
			throw new InvalidScheduleException("Choose a day from today on.");
		}
		if (date.isAfter(today.plusYears(MAX_YEARS_AHEAD))) {
			throw new InvalidScheduleException("Choose a day within 2 years of today.");
		}
		occurrences.place(item.getId(), date, OccurrenceStatus.PENDING.name(), null, null);
		log.info("User {} scheduled backlog item {}", userId, item.getId());
	}

	/** Marks an open item done on today or an earlier day; it then shows in the week view as done. */
	@Transactional
	public void done(long userId, long itemId, LocalDate date) {
		Household household = households.householdOf(userId);
		Task item = openItem(household, itemId);
		if (date.isAfter(today(household))) {
			throw new InvalidScheduleException("Choose today or an earlier day.");
		}
		occurrences.place(item.getId(), date, OccurrenceStatus.DONE.name(), userId, Instant.now(clock));
		log.info("User {} marked backlog item {} done", userId, item.getId());
	}

	/**
	 * Deletes an item for good, with all its days (the database cascades to its occurrences).
	 * Unlike a recurring task there's no repeating history to keep, and an item already on a day
	 * can be deleted from the week view too.
	 */
	@Transactional
	public void delete(long userId, long itemId) {
		Household household = households.householdOf(userId);
		Task item = tasks.findItem(household.getId(), itemId).orElseThrow(TaskNotFoundException::new);
		tasks.delete(item);
		log.info("User {} deleted backlog item {}", userId, item.getId());
	}

	/** Items already on the schedule are changed from the week view instead (404 here). */
	private Task openItem(Household household, long itemId) {
		return tasks.findOpenItem(household.getId(), itemId).orElseThrow(TaskNotFoundException::new);
	}

	private LocalDate today(Household household) {
		return LocalDate.now(clock.withZone(ZoneId.of(household.getTimeZone())));
	}

}
