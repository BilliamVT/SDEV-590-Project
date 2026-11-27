import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { OccurrenceStatus, Schedule, ScheduledOccurrence } from './schedule.models';

/** The household's schedule; the backend generates occurrences as needed (BILLIAMVT-38). */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);

  /** Dates are yyyy-mm-dd and inclusive. */
  between(from: string, to: string): Observable<Schedule> {
    return this.http.get<Schedule>(`${environment.apiUrl}/api/schedule`, { params: { from, to } });
  }

  /** Done, skipped, or PENDING to undo; returns the updated occurrence (BILLIAMVT-25). */
  changeStatus(id: number, status: OccurrenceStatus): Observable<ScheduledOccurrence> {
    return this.http.put<ScheduledOccurrence>(`${environment.apiUrl}/api/occurrences/${id}/status`, { status });
  }

  /** Moves one day of a task to another day, yyyy-mm-dd; returns it (BILLIAMVT-27, 56). */
  move(id: number, date: string): Observable<ScheduledOccurrence> {
    return this.http.put<ScheduledOccurrence>(`${environment.apiUrl}/api/occurrences/${id}/date`, { date });
  }

  /** Gives one day its own assignee, or Anyone with null; returns it (BILLIAMVT-64). */
  assign(id: number, assigneeId: number | null): Observable<ScheduledOccurrence> {
    return this.http.put<ScheduledOccurrence>(`${environment.apiUrl}/api/occurrences/${id}/assignee`, { assigneeId });
  }

  /** Clears one day's own assignee, so it follows its task again; returns it (BILLIAMVT-64, Undo). */
  followTask(id: number): Observable<ScheduledOccurrence> {
    return this.http.delete<ScheduledOccurrence>(`${environment.apiUrl}/api/occurrences/${id}/assignee`);
  }

  /** Deletes one occurrence for good (BILLIAMVT-25). */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/api/occurrences/${id}`);
  }
}
