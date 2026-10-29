package com.housework.api.auth;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.auth.AuthDtos.AuthResponse;
import com.housework.api.auth.AuthDtos.LoginRequest;
import com.housework.api.auth.AuthDtos.RegisterRequest;

@RestController
@RequestMapping("/api/auth")
class AuthController {

	private final AuthService auth;

	AuthController(AuthService auth) {
		this.auth = auth;
	}

	/** Creates an account and logs it in. */
	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	AuthResponse register(@Valid @RequestBody RegisterRequest request) {
		return auth.register(request);
	}

	@PostMapping("/login")
	AuthResponse login(@Valid @RequestBody LoginRequest request) {
		return auth.login(request);
	}

}
