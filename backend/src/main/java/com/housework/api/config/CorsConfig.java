package com.housework.api.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Lets the front end (a different origin) call the API from the browser. Spring
 * Security applies this before authentication, so preflight requests don't need a
 * token. Actuator endpoints are configured separately via management.endpoints.web.cors.*.
 */
@Configuration
class CorsConfig {

	@Bean
	CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}") List<String> allowedOrigins) {
		CorsConfiguration api = new CorsConfiguration();
		api.setAllowedOrigins(allowedOrigins);
		api.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE"));
		api.setAllowedHeaders(List.of("Authorization", "Content-Type"));
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/api/**", api);
		return source;
	}

}
