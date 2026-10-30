package com.housework.api.household;

import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.housework.api.IntegrationTest;
import com.housework.api.auth.TokenService;
import com.housework.api.user.AppUser;
import com.housework.api.user.AppUserRepository;

import static org.assertj.core.api.Assertions.assertThat;

@IntegrationTest
@Transactional
class HouseholdTests {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private AppUserRepository users;

	@Autowired
	private HouseholdRepository households;

	@Autowired
	private TokenService tokens;

	@Test
	void aNewAccountHasNoHouseholdUntilItCreatesOne() {
		String token = register("pat@example.com", "Pat");
		assertThat(get(token)).hasStatus(404);

		MvcTestResult created = create(token, "  The Flat  ", "Europe/London");

		assertThat(created).hasStatus(201);
		MvcTestResult result = get(token);
		assertThat(text(result, "$.name")).isEqualTo("The Flat");
		assertThat(text(result, "$.timeZone")).isEqualTo("Europe/London");
		assertThat(text(result, "$.inviteCode")).matches("[A-HJKMNP-Z2-9]{8}");
		assertThat(names(result)).containsExactly("Pat");
		// Members see each other's names, not emails
		assertThat(body(result)).doesNotContain("pat@example.com");
	}

	@Test
	void aUserCanOnlyCreateOneHousehold() {
		String token = registerWithHousehold("pat@example.com", "Pat");

		assertThat(create(token, "Second home", "America/New_York")).hasStatus(409);
	}

	@Test
	void accountsCreatedBeforeHouseholdsExistedCanCreateOne() {
		AppUser legacy = users.save(new AppUser("legacy@example.com", "Lee", "{noop}x"));
		String token = tokens.issueFor(legacy).value();

		assertThat(get(token)).hasStatus(404);
		assertThat(create(token, "Lee's household", "America/Chicago")).hasStatus(201);
	}

	@Test
	void createRejectsInvalidInput() {
		String token = register("zone@example.com", "Zoe");

		assertThat(create(token, "Home", "Mars/Olympus")).hasStatus(400);
		assertThat(create(token, "Home", "+05:00")).hasStatus(400);
		assertThat(create(token, " ", "America/New_York")).hasStatus(400);
		assertThat(get(token)).hasStatus(404);
	}

	@Test
	void aNewAccountCanJoinStraightAway() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = register("blair@example.com", "Blair");

		assertThat(join(blair, text(get(alex), "$.inviteCode"))).hasStatusOk();
		assertThat(names(get(alex))).containsExactly("Alex", "Blair");
	}

	@Test
	void membersOfDifferentHouseholdsCantSeeEachOther() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = registerWithHousehold("blair@example.com", "Blair");

		MvcTestResult alexHousehold = get(alex);
		MvcTestResult blairHousehold = get(blair);

		assertThat(value(alexHousehold, "$.id")).isNotEqualTo(value(blairHousehold, "$.id"));
		assertThat(names(alexHousehold)).containsExactly("Alex");
		assertThat(body(alexHousehold)).doesNotContain(text(blairHousehold, "$.inviteCode"));
	}

	@Test
	void joiningWithAnInviteCodeSharesTheHouseholdAndDeletesTheEmptyOne() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = registerWithHousehold("blair@example.com", "Blair");
		Long blairsOldHousehold = users.findByEmail("blair@example.com").orElseThrow().getHouseholdId();
		String code = text(get(alex), "$.inviteCode");

		// Typed the way people do: lowercase, with a dash
		MvcTestResult joined = join(blair, code.substring(0, 4).toLowerCase() + "-" + code.substring(4).toLowerCase());

		assertThat(joined).hasStatusOk();
		assertThat(value(get(blair), "$.id")).isEqualTo(value(get(alex), "$.id"));
		assertThat(names(get(alex))).containsExactly("Alex", "Blair");
		assertThat(households.existsById(blairsOldHousehold)).isFalse();
	}

	@Test
	void leavingAHouseholdThatStillHasMembersKeepsIt() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = registerWithHousehold("blair@example.com", "Blair");
		String casey = registerWithHousehold("casey@example.com", "Casey");
		join(blair, text(get(alex), "$.inviteCode"));
		Long alexHousehold = users.findByEmail("alex@example.com").orElseThrow().getHouseholdId();

		join(blair, text(get(casey), "$.inviteCode"));

		assertThat(households.existsById(alexHousehold)).isTrue();
		assertThat(names(get(alex))).containsExactly("Alex");
		assertThat(names(get(casey))).containsExactlyInAnyOrder("Casey", "Blair");
	}

	@Test
	void joiningYourOwnHouseholdChangesNothing() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		MvcTestResult before = get(alex);

		assertThat(join(alex, text(before, "$.inviteCode"))).hasStatusOk();
		assertThat(value(get(alex), "$.id")).isEqualTo(value(before, "$.id"));
	}

	@Test
	void unknownInviteCodeIsRejected() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		Object before = value(get(alex), "$.id");

		assertThat(join(alex, "ZZZZ-ZZZZ")).hasStatus(404);
		assertThat(value(get(alex), "$.id")).isEqualTo(before);
	}

	@Test
	void regeneratingTheInviteCodeStopsTheOldOneWorking() {
		String alex = registerWithHousehold("alex@example.com", "Alex");
		String blair = registerWithHousehold("blair@example.com", "Blair");
		String oldCode = text(get(alex), "$.inviteCode");

		MvcTestResult regenerated = mvc.post().uri("/api/household/invite-code").header(HttpHeaders.AUTHORIZATION, bearer(alex)).exchange();
		String newCode = text(regenerated, "$.inviteCode");

		assertThat(newCode).isNotEqualTo(oldCode);
		assertThat(join(blair, oldCode)).hasStatus(404);
		assertThat(join(blair, newCode)).hasStatusOk();
	}

	@Test
	void householdEndpointsRequireLogin() {
		assertThat(mvc.get().uri("/api/household")).hasStatus(401);
		assertThat(mvc.post().uri("/api/household/join").contentType(MediaType.APPLICATION_JSON)
			.content("{\"inviteCode\": \"ABCD2345\"}")).hasStatus(401);
	}

	private String register(String email, String displayName) {
		MvcTestResult result = mvc.post()
			.uri("/api/auth/register")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"email": "%s", "password": "correct-horse", "displayName": "%s"}
					""".formatted(email, displayName))
			.exchange();
		return text(result, "$.token");
	}

	private String registerWithHousehold(String email, String displayName) {
		String token = register(email, displayName);
		create(token, displayName + "'s household", "America/New_York");
		return token;
	}

	private MvcTestResult get(String token) {
		return mvc.get().uri("/api/household").header(HttpHeaders.AUTHORIZATION, bearer(token)).exchange();
	}

	private MvcTestResult create(String token, String name, String timeZone) {
		return mvc.post()
			.uri("/api/household")
			.header(HttpHeaders.AUTHORIZATION, bearer(token))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"%s\", \"timeZone\": \"%s\"}".formatted(name, timeZone))
			.exchange();
	}

	private MvcTestResult join(String token, String inviteCode) {
		return mvc.post()
			.uri("/api/household/join")
			.header(HttpHeaders.AUTHORIZATION, bearer(token))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"inviteCode\": \"%s\"}".formatted(inviteCode))
			.exchange();
	}

	private static String bearer(String token) {
		return "Bearer " + token;
	}

	private static Object value(MvcTestResult result, String path) {
		return JsonPath.read(body(result), path);
	}

	private static String text(MvcTestResult result, String path) {
		return JsonPath.read(body(result), path);
	}

	private static List<String> names(MvcTestResult result) {
		return JsonPath.read(body(result), "$.members[*].displayName");
	}

	private static String body(MvcTestResult result) {
		try {
			return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
		}
		catch (UnsupportedEncodingException ex) {
			throw new IllegalStateException(ex);
		}
	}

}
