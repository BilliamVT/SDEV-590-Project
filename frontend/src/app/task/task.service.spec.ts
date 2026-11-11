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
});
