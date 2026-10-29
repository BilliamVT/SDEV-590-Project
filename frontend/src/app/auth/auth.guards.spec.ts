import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { authGuard, guestGuard } from './auth.guards';
import { AuthService } from './auth.service';

describe('auth guards', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function withLogin(loggedIn: boolean): void {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isLoggedIn: signal(loggedIn) } }],
    });
  }

  const run = (guard: typeof authGuard) => TestBed.runInInjectionContext(() => guard(route, state));

  it('authGuard lets logged-in users through', () => {
    withLogin(true);
    expect(run(authGuard)).toBe(true);
  });

  it('authGuard sends logged-out visitors to /login', () => {
    withLogin(false);
    expect((run(authGuard) as UrlTree).toString()).toBe('/login');
  });

  it('guestGuard sends logged-in users home', () => {
    withLogin(true);
    expect((run(guestGuard) as UrlTree).toString()).toBe('/');
  });

  it('guestGuard lets logged-out visitors see login and register', () => {
    withLogin(false);
    expect(run(guestGuard)).toBe(true);
  });
});
