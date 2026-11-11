package com.housework.api.task;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.housework.api.task.TaskDtos.CreateTaskRequest;
import com.housework.api.task.TaskDtos.TaskResponse;

/** The logged-in user's household's tasks. No household IDs: see decision record 0005. */
@RestController
@RequestMapping("/api/tasks")
class TaskController {

	private final TaskService tasks;

	TaskController(TaskService tasks) {
		this.tasks = tasks;
	}

	@GetMapping
	List<TaskResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return tasks.list(userId(jwt));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	TaskResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateTaskRequest request) {
		return tasks.create(userId(jwt), request);
	}

	@GetMapping("/{id}")
	TaskResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return tasks.get(userId(jwt), id);
	}

	@PutMapping("/{id}")
	TaskResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable long id,
			@Valid @RequestBody CreateTaskRequest request) {
		return tasks.update(userId(jwt), id, request);
	}

	@PostMapping("/{id}/pause")
	TaskResponse pause(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return tasks.pause(userId(jwt), id);
	}

	@PostMapping("/{id}/resume")
	TaskResponse resume(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		return tasks.resume(userId(jwt), id);
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
		tasks.delete(userId(jwt), id);
	}

	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

}
