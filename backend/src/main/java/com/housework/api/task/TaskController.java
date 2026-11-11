package com.housework.api.task;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
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

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	TaskResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateTaskRequest request) {
		return tasks.create(Long.parseLong(jwt.getSubject()), request);
	}

}
