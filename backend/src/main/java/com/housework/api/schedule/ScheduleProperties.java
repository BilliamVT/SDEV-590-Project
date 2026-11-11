package com.housework.api.schedule;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/** app.schedule.* settings (BILLIAMVT-38); checked at startup. */
@Validated
@ConfigurationProperties("app.schedule")
record ScheduleProperties(
		/** How many weeks past today are always generated */
		@Min(1) @Max(26) int weeksAhead) {
}
