import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the actuator health endpoint and emits the status', () => {
    let status: string | undefined;
    service.status().subscribe((s) => (status = s));

    const request = http.expectOne(`${environment.apiUrl}/actuator/health`);
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'UP', groups: ['liveness', 'readiness'] });

    expect(status).toBe('UP');
  });

  it('passes through a non-UP status', () => {
    let status: string | undefined;
    service.status().subscribe((s) => (status = s));

    http.expectOne(`${environment.apiUrl}/actuator/health`).flush({ status: 'DOWN' });

    expect(status).toBe('DOWN');
  });

  it('errors when the request fails', () => {
    let failed = false;
    service.status().subscribe({ error: () => (failed = true) });

    http
      .expectOne(`${environment.apiUrl}/actuator/health`)
      .flush('unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(failed).toBe(true);
  });
});
