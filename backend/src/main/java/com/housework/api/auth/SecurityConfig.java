package com.housework.api.auth;

import java.nio.charset.StandardCharsets;
import java.time.Clock;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Stateless API security (decision record 0004): register and login are public, the
 * health check is public, and every other request needs a valid Bearer JWT.
 */
@Configuration
@EnableConfigurationProperties(JwtProperties.class)
class SecurityConfig {

	@Bean
	SecurityFilterChain apiSecurity(HttpSecurity http, CurrentUserJwtConverter currentUser) throws Exception {
		http
			// Uses the CorsConfigurationSource bean (CorsConfig)
			.cors(Customizer.withDefaults())
			// No cookies: browsers don't attach the Authorization header on their own,
			// so cross-site request forgery doesn't apply
			.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(requests -> requests
				.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
				// Lets error responses (e.g. validation failures) through instead of turning them into 401s
				.requestMatchers("/error").permitAll()
				.anyRequest().authenticated())
			.oauth2ResourceServer(resourceServer -> resourceServer
				.jwt(jwt -> jwt.jwtAuthenticationConverter(currentUser)));
		return http.build();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		// BCrypt by default; stored hashes are prefixed with the algorithm, e.g. {bcrypt}
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	@Bean
	JwtEncoder jwtEncoder(JwtProperties properties) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(signingKey(properties)));
	}

	@Bean
	JwtDecoder jwtDecoder(JwtProperties properties) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(signingKey(properties))
			.macAlgorithm(MacAlgorithm.HS256)
			.build();
		// Checks expiry (the default) and that we issued the token
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
				JwtValidators.createDefaultWithIssuer(TokenService.ISSUER)));
		return decoder;
	}

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}

	private static SecretKey signingKey(JwtProperties properties) {
		return new SecretKeySpec(properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
	}

}
