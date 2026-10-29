import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthResponse, LoginRequest, RegisterRequest, User } from './auth.models';

const STORAGE_KEY = 'housework.session';

interface Session {
  token: string;
  expiresAt: string;
  user: User;
}

/**
 * Logs in and out, and remembers the session (decision record 0004): the JWT is kept
 * in localStorage so it survives page reloads, and sent with each API call by authInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<Session | null>(this.restore());

  /** The logged-in user, or null. */
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isLoggedIn = computed(() => this.session() !== null);

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/api/auth/register`, request)
      .pipe(tap((response) => this.start(response)));
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/api/auth/login`, request)
      .pipe(tap((response) => this.start(response)));
  }

  /** Forgets the token. With JWTs there's nothing to tell the server. */
  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
  }

  /** The token to send, or null if logged out or expired. */
  token(): string | null {
    const session = this.session();
    if (session && isExpired(session)) {
      this.logout();
      return null;
    }
    return session?.token ?? null;
  }

  private start(response: AuthResponse): void {
    const session: Session = { token: response.token, expiresAt: response.expiresAt, user: response.user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }

  private restore(): Session | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const session = stored ? (JSON.parse(stored) as Session) : null;
      if (!session || isExpired(session)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
}

function isExpired(session: Session): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now();
}
