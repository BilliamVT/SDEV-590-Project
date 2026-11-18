package com.housework.api.feature;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * features.* release toggles (decision record 0002): off unless set, so production is safe by
 * default. The "local" profile turns them on; on Render an env var such as FEATURES_DRAGDROP=true
 * does (the app restarts).
 */
@ConfigurationProperties("features")
record FeatureProperties(
		/** The drag-and-drop UI (BILLIAMVT-28); the move API itself is released (BILLIAMVT-56) */
		boolean dragDrop) {
}
