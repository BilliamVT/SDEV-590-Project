package com.housework.api.schedule;

/** No such occurrence in the user's household (404, decision record 0005). */
public class OccurrenceNotFoundException extends RuntimeException {

	OccurrenceNotFoundException() {
		super("Occurrence not found");
	}

}
