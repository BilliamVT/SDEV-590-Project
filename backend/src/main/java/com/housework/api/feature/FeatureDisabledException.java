package com.housework.api.feature;

/** An unreleased feature's endpoint was called while its flag is off: 404, as if it didn't exist. */
public class FeatureDisabledException extends RuntimeException {

	FeatureDisabledException() {
		super("Not found");
	}

}
