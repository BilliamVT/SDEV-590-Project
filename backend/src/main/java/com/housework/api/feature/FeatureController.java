package com.housework.api.feature;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/features: which unreleased features are on, so the front end can hide their controls.
 * No login needed; it's read once when the app starts and says nothing about any user.
 */
@RestController
class FeatureController {

	private final FeatureFlags flags;

	FeatureController(FeatureFlags flags) {
		this.flags = flags;
	}

	@GetMapping("/api/features")
	FeaturesResponse features() {
		return new FeaturesResponse(flags.dragDrop());
	}

	record FeaturesResponse(boolean dragDrop) {
	}

}
