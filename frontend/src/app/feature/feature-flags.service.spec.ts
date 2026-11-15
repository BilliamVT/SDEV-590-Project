import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FeatureFlagsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('is off until the flags arrive, then follows the server', () => {
    service.load();
    expect(service.dragDrop()).toBe(false);

    const request = http.expectOne(`${environment.apiUrl}/api/features`);
    expect(request.request.method).toBe('GET');
    request.flush({ dragDrop: true });

    expect(service.dragDrop()).toBe(true);
  });

  it('stays off when the request fails', () => {
    service.load();

    http
      .expectOne(`${environment.apiUrl}/api/features`)
      .flush('unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(service.dragDrop()).toBe(false);
  });

  it('treats a flag the server leaves out as off', () => {
    service.load();

    http.expectOne(`${environment.apiUrl}/api/features`).flush({});

    expect(service.dragDrop()).toBe(false);
  });
});
