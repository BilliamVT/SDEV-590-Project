import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { ScheduleService } from './schedule.service';

describe('ScheduleService', () => {
  it('asks for a date range', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(ScheduleService).between('2026-11-08', '2026-11-14').subscribe();

    http.expectOne(`${environment.apiUrl}/api/schedule?from=2026-11-08&to=2026-11-14`).flush({});
    http.verify();
  });

  it('changes an occurrence status', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(ScheduleService).changeStatus(7, 'DONE').subscribe();

    const request = http.expectOne(`${environment.apiUrl}/api/occurrences/7/status`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ status: 'DONE' });
    request.flush({});
    http.verify();
  });

  it('deletes an occurrence', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(ScheduleService).delete(7).subscribe();

    expect(http.expectOne(`${environment.apiUrl}/api/occurrences/7`).request.method).toBe('DELETE');
    http.verify();
  });
});
