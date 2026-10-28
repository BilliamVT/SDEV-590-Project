import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, timeout } from 'rxjs';

import { environment } from '../../environments/environment';

/** "UP" when the backend and its database are healthy; anything else is reported as-is. */
export type BackendStatus = string;

interface HealthResponse {
  status: BackendStatus;
}

// The free Render instance can take about a minute to wake up from sleep.
const HEALTH_TIMEOUT_MS = 90_000;

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  /** Calls the backend's Actuator health endpoint and emits its status. */
  status(): Observable<BackendStatus> {
    return this.http
      .get<HealthResponse>(`${environment.apiUrl}/actuator/health`)
      .pipe(
        timeout(HEALTH_TIMEOUT_MS),
        map((response) => response.status),
      );
  }
}
