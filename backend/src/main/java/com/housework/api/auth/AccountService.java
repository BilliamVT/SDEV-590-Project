package com.housework.api.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.HouseholdService;
import com.housework.api.user.AppUser;
import com.housework.api.user.AppUserRepository;

/** The logged-in user's own account (BILLIAMVT-41). Logs by user ID only. */
@Service
public class AccountService {

	private static final Logger log = LoggerFactory.getLogger(AccountService.class);

	private final AppUserRepository users;

	private final PasswordEncoder passwordEncoder;

	private final HouseholdService households;

	AccountService(AppUserRepository users, PasswordEncoder passwordEncoder, HouseholdService households) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.households = households;
	}

	/**
	 * Deletes the account after checking the password. The database un-links the user's
	 * completed occurrences, so the household keeps its history (V1: completed_by set null).
	 * If they were the household's last member, the household and its tasks go too.
	 * Their token stops working at once (CurrentUserJwtConverter checks the user exists).
	 */
	@Transactional
	public void delete(long userId, String password) {
		// CurrentUserJwtConverter has already checked that this user exists
		AppUser user = users.findById(userId).orElseThrow();
		if (!passwordEncoder.matches(password, user.getPasswordHash())) {
			log.warn("Account deletion rejected for user {}: incorrect password", userId);
			throw new IncorrectPasswordException();
		}
		Long householdId = user.getHouseholdId();
		users.delete(user);
		users.flush();
		log.info("Deleted user {}", userId);
		households.deleteIfEmpty(householdId);
	}

}
