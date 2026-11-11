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

  create(request: CreateTaskRequest): Observable<Task> {
    return this.http.post<Task>(this.url, request);
  }
}
