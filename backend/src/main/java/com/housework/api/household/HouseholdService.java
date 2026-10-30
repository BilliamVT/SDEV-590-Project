package com.housework.api.household;

import java.time.ZoneId;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.household.HouseholdDtos.HouseholdResponse;
import com.housework.api.user.AppUser;
import com.housework.api.user.AppUserRepository;

/**
 * Households and membership. The household is always the logged-in user's own; nothing
 * here takes a household ID from the request (decision record 0005). Logs by ID only.
 */
@Service
public class HouseholdService {

	private static final Logger log = LoggerFactory.getLogger(HouseholdService.class);

	private static final int INVITE_CODE_ATTEMPTS = 5;

	private final HouseholdRepository households;

	private final AppUserRepository users;

	HouseholdService(HouseholdRepository households, AppUserRepository users) {
		this.households = households;
		this.users = users;
	}

	@Transactional(readOnly = true)
	public HouseholdResponse get(long userId) {
		return response(householdOf(user(userId)));
	}

	/** After sign-up, a user without a household creates one (or joins one with an invite code). */
	@Transactional
	public HouseholdResponse create(long userId, String name, String timeZone) {
		AppUser user = user(userId);
		if (user.getHouseholdId() != null) {
			throw new AlreadyInHouseholdException();
		}
		Household household = households.save(new Household(name.strip(), validTimeZone(timeZone), uniqueInviteCode()));
		user.moveToHousehold(household.getId());
		log.info("User {} created household {}", user.getId(), household.getId());
		return response(household);
	}

	/**
	 * Moves the user into the household with this invite code. If they were the last member of
	 * their old household, it's deleted along with its tasks (the front end warns first).
	 */
	@Transactional
	public HouseholdResponse join(long userId, String inviteCode) {
		AppUser user = user(userId);
		Household target = households.findByInviteCode(InviteCodes.normalize(inviteCode))
			.orElseThrow(InviteCodeNotFoundException::new);
		Long previousId = user.getHouseholdId();
		if (target.getId().equals(previousId)) {
			return response(target);
		}
		user.moveToHousehold(target.getId());
		users.saveAndFlush(user);
		log.info("User {} joined household {}", user.getId(), target.getId());
		if (previousId != null && users.countByHouseholdId(previousId) == 0) {
			households.deleteById(previousId);
			log.info("Deleted household {}: no members left", previousId);
		}
		return response(target);
	}

	/** Replaces the invite code; the old one stops working. */
	@Transactional
	public HouseholdResponse regenerateInviteCode(long userId) {
		AppUser user = user(userId);
		Household household = householdOf(user);
		household.replaceInviteCode(uniqueInviteCode());
		log.info("User {} replaced the invite code of household {}", user.getId(), household.getId());
		return response(household);
	}

	private AppUser user(long userId) {
		// CurrentUserJwtConverter has already checked that this user exists
		return users.findById(userId).orElseThrow();
	}

	private Household householdOf(AppUser user) {
		if (user.getHouseholdId() == null) {
			throw new NoHouseholdException();
		}
		return households.findById(user.getHouseholdId()).orElseThrow(NoHouseholdException::new);
	}

	private HouseholdResponse response(Household household) {
		return HouseholdResponse.from(household, users.findAllByHouseholdIdOrderById(household.getId()));
	}

	private String uniqueInviteCode() {
		for (int attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
			String code = InviteCodes.generate();
			if (!households.existsByInviteCode(code)) {
				return code;
			}
		}
		throw new IllegalStateException("Couldn't generate a unique invite code");
	}

	/** Region IDs only (America/New_York), not offsets like +05:00 that ignore daylight saving. */
	private static String validTimeZone(String timeZone) {
		String zone = timeZone == null ? "" : timeZone.strip();
		if (!ZoneId.getAvailableZoneIds().contains(zone)) {
			throw new InvalidTimeZoneException();
		}
		return zone;
	}

}
