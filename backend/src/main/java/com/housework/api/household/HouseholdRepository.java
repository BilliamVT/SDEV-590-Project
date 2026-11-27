package com.housework.api.household;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface HouseholdRepository extends JpaRepository<Household, Long> {

	Optional<Household> findByInviteCode(String inviteCode);

	boolean existsByInviteCode(String inviteCode);

	/** Takes a member who left off the household's tasks: they go back to Anyone (BILLIAMVT-64). */
	@Modifying
	@Query(value = "update task set assigned_to = null where household_id = :householdId and assigned_to = :userId",
			nativeQuery = true)
	int unassignTasks(@Param("householdId") long householdId, @Param("userId") long userId);

	/** The same for days given their own assignee; they stay set, now to Anyone. */
	@Modifying
	@Query(value = """
			update occurrence o set assigned_to = null
			from task t
			where t.id = o.task_id and t.household_id = :householdId and o.assigned_to = :userId""",
			nativeQuery = true)
	int unassignOccurrences(@Param("householdId") long householdId, @Param("userId") long userId);

}
