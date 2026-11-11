package com.housework.api.task;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {

	/** Tasks that get occurrences: not paused, not deleted. */
	List<Task> findAllByHouseholdIdAndActiveTrueAndDeletedAtIsNull(Long householdId);

}
