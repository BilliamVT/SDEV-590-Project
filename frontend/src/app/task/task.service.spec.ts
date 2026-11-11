import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { TaskService } from './task.service';

describe('TaskService', () => {
  it('creates a task', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);

    TestBed.inject(TaskService).create({ name: 'Vacuum', frequency: 'WEEKLY', dayOfWeek: 'SATURDAY' }).subscribe();

    const request = http.expectOne({ method: 'POST', url: `${environment.apiUrl}/api/tasks` });
    expect(request.request.body).toEqual({ name: 'Vacuum', frequency: 'WEEKLY', dayOfWeek: 'SATURDAY' });
    request.flush({});
    http.verify();
  });

  it('lists, gets, updates, pauses, resumes and deletes tasks', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(TaskService);
    const url = `${environment.apiUrl}/api/tasks`;

    service.list().subscribe();
    http.expectOne({ method: 'GET', url }).flush([]);
    service.get(7).subscribe();
    http.expectOne({ method: 'GET', url: `${url}/7` }).flush({});
    service.update(7, { name: 'Dishes', frequency: 'DAILY' }).subscribe();
    expect(http.expectOne({ method: 'PUT', url: `${url}/7` }).request.body).toEqual({ name: 'Dishes', frequency: 'DAILY' });
    service.pause(7).subscribe();
    http.expectOne({ method: 'POST', url: `${url}/7/pause` }).flush({});
    service.resume(7).subscribe();
    http.expectOne({ method: 'POST', url: `${url}/7/resume` }).flush({});
    service.delete(7).subscribe();
    http.expectOne({ method: 'DELETE', url: `${url}/7` }).flush(null);
    http.verify();
  });
});
