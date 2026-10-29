package com.housework.api.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

	/** Callers pass the email already lowercased, so the unique index is used. */
	Optional<AppUser> findByEmail(String email);

	boolean existsByEmail(String email);

}
