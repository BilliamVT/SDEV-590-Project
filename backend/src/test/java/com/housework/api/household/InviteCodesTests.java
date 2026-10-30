package com.housework.api.household;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InviteCodesTests {

	@Test
	void generatedCodesUseOnlyCharactersThatCantBeConfused() {
		for (int i = 0; i < 1000; i++) {
			assertThat(InviteCodes.generate()).hasSize(InviteCodes.LENGTH).doesNotContainPattern("[01OIL]");
		}
	}

	@Test
	void normalizeAcceptsWhatPeopleType() {
		assertThat(InviteCodes.normalize("k7qm-3xrp")).isEqualTo("K7QM3XRP");
		assertThat(InviteCodes.normalize(" K7QM 3XRP ")).isEqualTo("K7QM3XRP");
	}

}
