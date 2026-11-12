import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { BacklogService } from './backlog.service';

describe('BacklogService', () => {
  let service: BacklogService;
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/api/backlog`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BacklogService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists and adds items', () => {
    service.list().subscribe();
    expect(http.expectOne({ method: 'GET', url }).request.body).toBeNull();

    service.create({ name: 'Hang shelves' }).subscribe();
    expect(http.expectOne({ method: 'POST', url }).request.body).toEqual({ name: 'Hang shelves' });
  });

  it('schedules, marks done and deletes one item', () => {
    service.schedule(4, '2026-11-13').subscribe();
    expect(http.expectOne({ method: 'PUT', url: `${url}/4/schedule` }).request.body).toEqual({ date: '2026-11-13' });

    service.done(4, '2026-11-11').subscribe();
    expect(http.expectOne({ method: 'POST', url: `${url}/4/done` }).request.body).toEqual({ date: '2026-11-11' });

    service.delete(4).subscribe();
    http.expectOne({ method: 'DELETE', url: `${url}/4` });
  });
});
