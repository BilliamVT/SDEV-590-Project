import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { Household } from './household.models';

/** The logged-in user's household (decision record 0005: no household IDs in requests). */
@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/household`;

  /** The user's household, or null if they haven't created or joined one yet. */
  load(): Observable<Household | null> {
    return this.http.get<Household>(this.url).pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error),
      ),
    );
  }

  /** Creates a household with the browser's time zone, which decides its "today". */
  create(name: string): Observable<Household> {
    return this.http.post<Household>(this.url, { name, timeZone: browserTimeZone() });
  }

  /** Changes the household's settings (BILLIAMVT-46). */
  update(changes: { name: string }): Observable<Household> {
    return this.http.patch<Household>(this.url, changes);
  }

  join(inviteCode: string): Observable<Household> {
    return this.http.post<Household>(`${this.url}/join`, { inviteCode });
  }

  /** Replaces the invite code; the old one stops working. */
  regenerateInviteCode(): Observable<Household> {
    return this.http.post<Household>(`${this.url}/invite-code`, {});
  }
}

/** The browser's IANA time zone, e.g. America/New_York. It decides the household's "today". */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** K7QM3XRP → K7QM-3XRP, easier to read out. */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
