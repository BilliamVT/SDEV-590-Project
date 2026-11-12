package com.housework.api.task;

import java.util.List;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.task.BacklogDtos.CreateItemRequest;
import com.housework.api.task.BacklogDtos.DayRequest;
import com.housework.api.task.BacklogDtos.ItemResponse;

/** The household's one-off items (BILLIAMVT-23). No household IDs: see decision record 0005. */
@RestController
@RequestMapping("/api/backlog")
class BacklogController {

	private final BacklogService backlog;

	BacklogController(BacklogService backlog) {
		this.backlog = backlog;
	}

	@GetMapping
	List<ItemResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return backlog.list(userId(jwt));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	ItemResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateItemRequest request) {
		return backlog.create(userId(jwt), request);
	}

	@PutMapping("/{id}/schedule")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void schedule(@AuthenticationPrincipal Jwt jwt, @PathVariable long id, @Valid @RequestBody DayRequest request) {
		backlog.schedule(userId(jwt), id, request.date());
	}

	@PostMapping("/{id}/done")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void done(@AuthenticationPrincipal Jwt jwt, @PathVariable long id, @Valid @RequestBody DayRequest request) {
		backlog.done(userId(jwt), id, request.date());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		backlog.delete(userId(jwt), id);
	}

	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
