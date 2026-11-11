import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Schedule } from './schedule.models';

/** The household's schedule; the backend generates occurrences as needed (BILLIAMVT-38). */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);

  /** Dates are yyyy-mm-dd and inclusive. */
  between(from: string, to: string): Observable<Schedule> {
    return this.http.get<Schedule>(`${environment.apiUrl}/api/schedule`, { params: { from, to } });
  }
}
