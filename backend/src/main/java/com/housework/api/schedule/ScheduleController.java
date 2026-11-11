package com.housework.api.schedule;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.schedule.ScheduleDtos.ScheduleResponse;

/** The logged-in user's household's schedule. No household IDs: see decision record 0005. */
@RestController
class ScheduleController {

	private final ScheduleService schedule;

	ScheduleController(ScheduleService schedule) {
		this.schedule = schedule;
	}

	/** e.g. /api/schedule?from=2026-11-09&to=2026-11-15 (dates inclusive, at most 6 weeks) */
	@GetMapping("/api/schedule")
	ScheduleResponse get(@AuthenticationPrincipal Jwt jwt,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
		return schedule.schedule(Long.parseLong(jwt.getSubject()), from, to);
	}

}
