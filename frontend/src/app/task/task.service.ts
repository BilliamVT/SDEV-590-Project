import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { CreateTaskRequest, Task } from './task.models';

/** The household's tasks (decision record 0005: the backend scopes them to the user's household). */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/tasks`;

  /** Paused tasks are included; deleted ones aren't. */
  list(): Observable<Task[]> {
    return this.http.get<Task[]>(this.url);
  }

  get(id: number): Observable<Task> {
    return this.http.get<Task>(`${this.url}/${id}`);
  }

  create(request: CreateTaskRequest): Observable<Task> {
    return this.http.post<Task>(this.url, request);
  }

  /** A changed schedule applies to future occurrences only. */
  update(id: number, request: CreateTaskRequest): Observable<Task> {
    return this.http.put<Task>(`${this.url}/${id}`, request);
  }

  pause(id: number): Observable<Task> {
    return this.http.post<Task>(`${this.url}/${id}/pause`, {});
  }

  resume(id: number): Observable<Task> {
    return this.http.post<Task>(`${this.url}/${id}/resume`, {});
  }

  /** Past occurrences stay as history; upcoming ones are removed. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
