import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

const API = `${environment.apiUrl}/api/`;
const AUTH_ENDPOINTS = `${environment.apiUrl}/api/auth/`;

/**
 * Adds the JWT to calls to our API. If the API answers 401 (token expired, or the
 * account was deleted), logs out and goes to the login page.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApiCall = request.url.startsWith(API);
  const token = isApiCall ? auth.token() : null;
  const authorized = token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      // A 401 from login itself just means a wrong password; the form shows that
      if (error instanceof HttpErrorResponse && error.status === 401 && isApiCall && !request.url.startsWith(AUTH_ENDPOINTS)) {
        auth.logout();
        void router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};
