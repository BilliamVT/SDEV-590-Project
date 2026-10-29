import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let token: string | null;
  let auth: { token: () => string | null; logout: ReturnType<typeof vi.fn>; isLoggedIn: ReturnType<typeof signal<boolean>> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    token = 'jwt-token';
    auth = { token: () => token, logout: vi.fn(), isLoggedIn: signal(true) };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  it('adds the token to API calls', () => {
    http.get(`${environment.apiUrl}/api/me`).subscribe();
    const request = controller.expectOne(`${environment.apiUrl}/api/me`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    request.flush({});
  });

  it('does not add the token to other calls', () => {
    http.get(`${environment.apiUrl}/actuator/health`).subscribe();
    http.get('https://example.com/data').subscribe();
    controller.expectOne(`${environment.apiUrl}/actuator/health`).flush({});
    const other = controller.expectOne('https://example.com/data');
    expect(other.request.headers.has('Authorization')).toBe(false);
    other.flush({});
  });

  it('sends no header when logged out', () => {
    token = null;
    http.get(`${environment.apiUrl}/api/me`).subscribe();
    const request = controller.expectOne(`${environment.apiUrl}/api/me`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('logs out and goes to login when the API rejects the token', () => {
    http.get(`${environment.apiUrl}/api/me`).subscribe({ error: () => undefined });
    controller.expectOne(`${environment.apiUrl}/api/me`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('leaves a failed login to the login form', () => {
    http.post(`${environment.apiUrl}/api/auth/login`, {}).subscribe({ error: () => undefined });
    controller
      .expectOne(`${environment.apiUrl}/api/auth/login`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
