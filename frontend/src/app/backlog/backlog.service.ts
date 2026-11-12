import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { BacklogItem, CreateItemRequest } from './backlog.models';

/** The household's one-off items (BILLIAMVT-23). Dates are yyyy-mm-dd. */
@Injectable({ providedIn: 'root' })
export class BacklogService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/backlog`;

  /** Only items not yet on a day, in the order they were added. */
  list(): Observable<BacklogItem[]> {
    return this.http.get<BacklogItem[]>(this.url);
  }

  create(request: CreateItemRequest): Observable<BacklogItem> {
    return this.http.post<BacklogItem>(this.url, request);
  }

  /** Puts the item on a day from today on; it then shows in the week view. */
  schedule(id: number, date: string): Observable<void> {
    return this.http.put<void>(`${this.url}/${id}/schedule`, { date });
  }

  /** Marks the item done on today or an earlier day. */
  done(id: number, date: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${id}/done`, { date });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
