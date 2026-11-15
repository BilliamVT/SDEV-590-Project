package com.housework.api.feature;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Flags from Spring configuration (decision record 0002, option A). */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(FeatureProperties.class)
class FeatureConfig {

	@Bean
	FeatureFlags featureFlags(FeatureProperties properties) {
		return properties::dragDrop;
	}

}
