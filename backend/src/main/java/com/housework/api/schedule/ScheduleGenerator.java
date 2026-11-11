package com.housework.api.schedule;

import java.time.LocalDate;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.task.Task;

/**
 * Turns tasks into occurrences, on demand: there's no nightly job, because the free Render
 * instance sleeps (BILLIAMVT-38). Each task remembers how far it's been generated
 * (task.generated_through, V4), so days nobody viewed are still filled in and show as overdue.
 * Inserting is idempotent, so two members viewing at once can't create duplicates.
 */
@Service
public class ScheduleGenerator {

	private static final Logger log = LoggerFactory.getLogger(ScheduleGenerator.class);

	private final OccurrenceRepository occurrences;

	private final RecurrenceCalculator calculator;

	private final ScheduleProperties properties;

	ScheduleGenerator(OccurrenceRepository occurrences, RecurrenceCalculator calculator, ScheduleProperties properties) {
		this.occurrences = occurrences;
		this.calculator = calculator;
		this.properties = properties;
	}

	/** Generates through the configured weeks past today (app.schedule.weeks-ahead). */
	@Transactional
	public void generateAhead(Task task, LocalDate today) {
		generateThrough(task, aheadOf(today));
	}

	/** Generates any missing occurrences up to {@code target}; nothing for paused or deleted tasks. */
	@Transactional
	public void generateThrough(Task task, LocalDate target) {
		if (!task.isScheduled() || task.getRecurrenceRule() == null) {
			return;
		}
		LocalDate from = task.getGeneratedThrough() == null ? task.getStartsOn() : task.getGeneratedThrough().plusDays(1);
		if (from.isAfter(target)) {
			return;
		}
		List<LocalDate> dates = calculator.datesBetween(task.getRecurrenceRule(), task.getStartsOn(), from, target);
		int inserted = 0;
		for (LocalDate date : dates) {
			inserted += occurrences.insertIfAbsent(task.getId(), date);
		}
		task.markGeneratedThrough(target);
		if (inserted > 0) {
			log.info("Generated {} occurrences of task {} through {}", inserted, task.getId(), target);
		}
	}

	/**
	 * After a task is edited or paused (BILLIAMVT-22): replaces its future occurrences that are
	 * still pending and haven't been moved. Done, skipped, moved and past occurrences are kept.
	 */
	@Transactional
	public void regenerate(Task task, LocalDate today) {
		int removed = occurrences.deleteReplaceable(task.getId(), today);
		if (task.getGeneratedThrough() != null && !task.getGeneratedThrough().isBefore(today)) {
			task.markGeneratedThrough(today.minusDays(1));
		}
		log.info("Regenerating task {}: removed {} future occurrences", task.getId(), removed);
		generateAhead(task, today);
	}

	/**
	 * After a task is resumed (BILLIAMVT-22): generates from today on, following the task's rule
	 * and original start date. The paused days aren't filled in, so they don't show as overdue.
	 */
	@Transactional
	public void resume(Task task, LocalDate today) {
		if (task.getGeneratedThrough() == null || task.getGeneratedThrough().isBefore(today.minusDays(1))) {
			task.markGeneratedThrough(today.minusDays(1));
		}
		generateAhead(task, today);
	}

	/** After a task is deleted: removes its pending occurrences from today on, moved ones too. */
	@Transactional
	public void removeUpcoming(Task task, LocalDate today) {
		int removed = occurrences.deleteUpcoming(task.getId(), today);
		log.info("Removed {} upcoming occurrences of deleted task {}", removed, task.getId());
	}

	LocalDate aheadOf(LocalDate today) {
		return today.plusWeeks(properties.weeksAhead());
	}

}
