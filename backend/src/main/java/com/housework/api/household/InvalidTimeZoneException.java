package com.housework.api.household;

/** Not an IANA time zone such as America/New_York (400). */
public class InvalidTimeZoneException extends RuntimeException {

	InvalidTimeZoneException() {
		super("Time zone must be an IANA zone such as America/New_York");
	}

}
