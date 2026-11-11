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

	private Long completedBy;

	private Instant completedAt;

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

}
