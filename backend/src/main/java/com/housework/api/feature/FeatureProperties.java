package com.housework.api.feature;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * features.* release toggles (decision record 0002): off unless set, so production is safe by
 * default. The "local" profile turns them on; on Render an env var such as FEATURES_DRAGDROP=true
 * does (the app restarts).
 */
@ConfigurationProperties("features")
record FeatureProperties(
		/** Moving an occurrence to another day (BILLIAMVT-27, 28) */
		boolean dragDrop) {
}
