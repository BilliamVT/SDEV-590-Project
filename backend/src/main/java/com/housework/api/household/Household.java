package com.housework.api.household;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/** A group of users who share one schedule. Maps the household table (V1, V3). */
@Entity
public class Household {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	private String name;

	/** IANA zone from the browser (e.g. America/New_York); decides what "today" is. */
	private String timeZone;

	/** Uppercase, no separators (V3). */
	private String inviteCode;

	@CreationTimestamp
	private Instant createdAt;

	@UpdateTimestamp
	private Instant updatedAt;

	protected Household() {
	}

	Household(String name, String timeZone, String inviteCode) {
		this.name = name;
		this.timeZone = timeZone;
		this.inviteCode = inviteCode;
	}

	public Long getId() {
		return id;
	}

	public String getName() {
		return name;
	}

	public String getTimeZone() {
		return timeZone;
	}

	public String getInviteCode() {
		return inviteCode;
	}

	void replaceInviteCode(String inviteCode) {
		this.inviteCode = inviteCode;
	}

}
