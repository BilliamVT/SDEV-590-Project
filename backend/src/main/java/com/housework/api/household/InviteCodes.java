package com.housework.api.household;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * Invite codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), so
 * they're easy to read out or type on a phone. About 8.5 × 10^11 possible codes.
 */
final class InviteCodes {

	static final int LENGTH = 8;

	private static final String ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

	private static final SecureRandom RANDOM = new SecureRandom();

	private InviteCodes() {
	}

	static String generate() {
		StringBuilder code = new StringBuilder(LENGTH);
		for (int i = 0; i < LENGTH; i++) {
			code.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
		}
		return code.toString();
	}

	/** Accepts what people type: any case, with dashes or spaces (k7qm-3xrp → K7QM3XRP). */
	static String normalize(String input) {
		return input.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
	}

}
