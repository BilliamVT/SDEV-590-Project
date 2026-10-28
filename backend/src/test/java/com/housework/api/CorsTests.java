package com.housework.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import static org.assertj.core.api.Assertions.assertThat;

@Import(TestContainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class CorsTests {

	private static final String FRONTEND = "https://billiamvt.github.io";

	@Autowired
	private MockMvcTester mvc;

	@Test
	void healthAllowsTheFrontendOrigin() {
		assertThat(mvc.get().uri("/actuator/health").header(HttpHeaders.ORIGIN, FRONTEND))
			.hasStatusOk()
			.hasHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND);
	}

	@Test
	void healthRejectsOtherOrigins() {
		assertThat(mvc.get().uri("/actuator/health").header(HttpHeaders.ORIGIN, "https://example.com"))
			.hasStatus(403)
			.doesNotContainHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN);
	}

	@Test
	void apiPreflightAllowsTheFrontendOrigin() {
		assertThat(mvc.options()
			.uri("/api/anything")
			.header(HttpHeaders.ORIGIN, FRONTEND)
			.header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
			.hasStatusOk()
			.hasHeader(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, FRONTEND);
	}

}
