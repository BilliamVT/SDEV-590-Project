package com.housework.api.task;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * A recurring task, or a one-off backlog item when it has no rule (BILLIAMVT-23). Maps the task table (V1).
 * Its occurrences are generated from the rule (BILLIAMVT-38).
 */
@Entity
public class Task {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long householdId;

	private String name;

	/** RFC 5545 rule built by RecurrenceRules, e.g. FREQ=WEEKLY;BYDAY=SA. */
	private String recurrenceRule;

	/** Where the recurrence starts (DTSTART). */
	private LocalDate startsOn;

	private Integer estimatedMinutes;

	/** False while paused (BILLIAMVT-22). */
	private boolean active = true;

	/** Set when deleted (BILLIAMVT-22); deleted tasks are kept so their history stays. */
	private Instant deletedAt;

	/** Occurrences exist up to this date (BILLIAMVT-38, V4); null before the first generation. */
	private LocalDate generatedThrough;

	@CreationTimestamp
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;

	protected Task() {
	}

	Task(Long householdId, String name, String recurrenceRule, LocalDate startsOn, Integer estimatedMinutes) {
		this.householdId = householdId;
		this.name = name;
		this.recurrenceRule = recurrenceRule;
		this.startsOn = startsOn;
		this.estimatedMinutes = estimatedMinutes;
	}

	public Long getId() {
		return id;
	}

	public Long getHouseholdId() {
		return householdId;
	}

	public String getName() {
		return name;
	}

	public String getRecurrenceRule() {
		return recurrenceRule;
	}

	public LocalDate getStartsOn() {
		return startsOn;
	}

	public Integer getEstimatedMinutes() {
		return estimatedMinutes;
	}

	public boolean isActive() {
		return active;
	}

	public boolean isDeleted() {
		return deletedAt != null;
	}

	/** Paused or deleted tasks get no new occurrences. */
	public boolean isScheduled() {
		return active && deletedAt == null;
	}

	public LocalDate getGeneratedThrough() {
		return generatedThrough;
	}

	void rename(String name, Integer estimatedMinutes) {
		this.name = name;
		this.estimatedMinutes = estimatedMinutes;
	}

	void reschedule(String recurrenceRule, LocalDate startsOn) {
		this.recurrenceRule = recurrenceRule;
		this.startsOn = startsOn;
	}

	void pause() {
		this.active = false;
	}

	void resume() {
		this.active = true;
	}

	/** Soft delete: the task and its past occurrences stay, as history. */
	void delete(Instant now) {
		this.deletedAt = now;
	}

	/** Called by schedule generation only. */
	public void markGeneratedThrough(LocalDate date) {
		this.generatedThrough = date;
	}

}
