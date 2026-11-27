package com.housework.api.schedule;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * One scheduled instance of a task. Maps the occurrence table (V1). Rows are inserted by
 * {@link ScheduleGenerator}; completing (BILLIAMVT-25) and moving (BILLIAMVT-27) change them.
 */
@Entity
public class Occurrence {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private Long taskId;

	/** The date the rule produced; unique per task, so generation never duplicates. */
	private LocalDate originalDate;

	/** Where it is on the schedule; differs from originalDate once moved. */
	private LocalDate scheduledDate;

	@Enumerated(EnumType.STRING)
	private OccurrenceStatus status;

	/** Who marked it done or skipped (the columns cover skips too), and when; cleared on undo. */
	private Long completedBy;

	private Instant completedAt;

	/** This day's own assignee (BILLIAMVT-64), used once assignmentSet is true; null means Anyone. */
	private Long assignedTo;

	/** False: the day follows its task's assignee. */
	private boolean assignmentSet;

	@CreationTimestamp
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;

	protected Occurrence() {
	}

	public Long getId() {
		return id;
	}

	public Long getTaskId() {
		return taskId;
	}

	public LocalDate getOriginalDate() {
		return originalDate;
	}

	public LocalDate getScheduledDate() {
		return scheduledDate;
	}

	public OccurrenceStatus getStatus() {
		return status;
	}

	/**
	 * Gives this day its own assignee, or Anyone with null (BILLIAMVT-64). From then on the
	 * task's assignee doesn't apply to it, and regenerating the task keeps it (deleteReplaceable).
	 */
	void assignTo(Long userId) {
		assignedTo = userId;
		assignmentSet = true;
	}

	/** Back to following its task's assignee (BILLIAMVT-64, Undo). */
	void followTask() {
		assignedTo = null;
		assignmentSet = false;
	}

	/** To another day (BILLIAMVT-27); back on its original date it's a normal day again. */
	void moveTo(LocalDate date) {
		scheduledDate = date;
	}

	/** Done or skipped records who and when; back to pending (undo) clears them. Same status: no change. */
	void changeStatus(OccurrenceStatus newStatus, long userId, Instant now) {
		if (newStatus == status) {
			return;
		}
		status = newStatus;
		completedBy = newStatus == OccurrenceStatus.PENDING ? null : userId;
		completedAt = newStatus == OccurrenceStatus.PENDING ? null : now;
	}

}
