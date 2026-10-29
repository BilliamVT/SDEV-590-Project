import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthResponse } from './auth.models';
import { AuthService } from './auth.service';

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const response = (expiresAt = inAnHour()): AuthResponse => ({
  token: 'jwt-token',
  expiresAt,
  user: { id: 2, email: 'bill@example.com', displayName: 'Bill' },
});

describe('AuthService', () => {
  let http: HttpTestingController;

  function createService(): AuthService {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => http.verify());

  it('logs in and remembers the session', () => {
    const auth = createService();
    auth.login({ email: 'bill@example.com', password: 'correct-horse' }).subscribe();

    const request = http.expectOne(`${environment.apiUrl}/api/auth/login`);
    expect(request.request.method).toBe('POST');
    request.flush(response());

    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()?.displayName).toBe('Bill');
    expect(auth.token()).toBe('jwt-token');
    expect(localStorage.getItem('housework.session')).toContain('jwt-token');
  });

  it('registers and logs in', () => {
    const auth = createService();
    auth.register({ email: 'bill@example.com', password: 'correct-horse', displayName: 'Bill' }).subscribe();

    http.expectOne(`${environment.apiUrl}/api/auth/register`).flush(response(), { status: 201, statusText: 'Created' });

    expect(auth.isLoggedIn()).toBe(true);
  });

  it('stays logged out when login fails', () => {
    const auth = createService();
    auth.login({ email: 'bill@example.com', password: 'wrong' }).subscribe({ error: () => undefined });

    http
      .expectOne(`${environment.apiUrl}/api/auth/login`)
      .flush({ detail: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('housework.session')).toBeNull();
  });

  it('logging out forgets the session', () => {
    const auth = createService();
    auth.login({ email: 'bill@example.com', password: 'correct-horse' }).subscribe();
    http.expectOne(`${environment.apiUrl}/api/auth/login`).flush(response());

    auth.logout();

    expect(auth.isLoggedIn()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('housework.session')).toBeNull();
  });

  it('restores a saved session after a page reload', () => {
    localStorage.setItem('housework.session', JSON.stringify(response()));

    const auth = createService();

    expect(auth.user()?.email).toBe('bill@example.com');
  });

  it('ignores an expired saved session', () => {
    localStorage.setItem('housework.session', JSON.stringify(response(new Date(Date.now() - 1000).toISOString())));

    const auth = createService();

    expect(auth.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('housework.session')).toBeNull();
  });
});
