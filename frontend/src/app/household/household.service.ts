import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { todayIn } from '../schedule/dates';
import { Household } from './household.models';

/** The logged-in user's household (decision record 0005: no household IDs in requests). */
@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/household`;
  /** The household's time zone, from the last household response; null until one arrives. */
  private readonly zone = signal<string | null>(null);
  readonly timeZoneKnown = computed(() => this.zone() !== null);

  /**
   * Today in the household's time zone, which is how the server decides "today" (BILLIAMVT-51).
   * Until the household has loaded, the browser's zone is the best guess. Worked out on each
   * call, so a page left open past midnight moves on to the new day.
   */
  today(): string {
    return todayIn(this.zone() ?? browserTimeZone());
  }

  /** The user's household, or null if they haven't created or joined one yet. */
  load(): Observable<Household | null> {
    return this.http.get<Household>(this.url).pipe(
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error),
      ),
      tap((household) => this.zone.set(household?.timeZone ?? null)),
    );
  }

  /** Creates a household with the browser's time zone, which decides its "today". */
  create(name: string): Observable<Household> {
    return this.http.post<Household>(this.url, { name, timeZone: browserTimeZone() }).pipe(this.remember());
  }

  /** Changes the household's settings (BILLIAMVT-46). */
  update(changes: { name: string }): Observable<Household> {
    return this.http.patch<Household>(this.url, changes).pipe(this.remember());
  }

  join(inviteCode: string): Observable<Household> {
    return this.http.post<Household>(`${this.url}/join`, { inviteCode }).pipe(this.remember());
  }

  /** Replaces the invite code; the old one stops working. */
  regenerateInviteCode(): Observable<Household> {
    return this.http.post<Household>(`${this.url}/invite-code`, {}).pipe(this.remember());
  }

  /** Keeps the time zone of the household in a response; joining one can change it. */
  private remember() {
    return tap((household: Household) => this.zone.set(household.timeZone));
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
