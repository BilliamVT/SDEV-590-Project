package com.housework.api.task;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskRepository extends JpaRepository<Task, Long> {

	/** The household's task list, paused ones included (BILLIAMVT-22). */
	List<Task> findAllByHouseholdIdAndDeletedAtIsNullOrderByNameAscIdAsc(Long householdId);

	/** One task, only if it belongs to the household and isn't deleted (decision record 0005). */
	Optional<Task> findByIdAndHouseholdIdAndDeletedAtIsNull(Long id, Long householdId);

	/** Tasks that get occurrences: not paused, not deleted. */
	List<Task> findAllByHouseholdIdAndActiveTrueAndDeletedAtIsNull(Long householdId);

}
