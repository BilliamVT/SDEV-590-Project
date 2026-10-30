import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { Household } from './household.models';
import { HouseholdService, browserTimeZone, formatInviteCode } from './household.service';

const url = `${environment.apiUrl}/api/household`;
const household: Household = {
  id: 1,
  name: "Bill's household",
  timeZone: 'America/New_York',
  inviteCode: 'K7QM3XRP',
  members: [{ id: 2, displayName: 'Bill' }],
};

describe('HouseholdService', () => {
  let http: HttpTestingController;
  let service: HouseholdService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HouseholdService);
  });

  afterEach(() => http.verify());

  it('loads the household', () => {
    let result: Household | null | undefined;
    service.load().subscribe((h) => (result = h));

    http.expectOne(url).flush(household);

    expect(result).toEqual(household);
  });

  it("returns null when the user doesn't have a household yet", () => {
    let result: Household | null | undefined;
    service.load().subscribe((h) => (result = h));

    http.expectOne(url).flush(null, { status: 404, statusText: 'Not Found' });

    expect(result).toBeNull();
  });

  it("creates a household with the browser's time zone", () => {
    service.create('The Flat').subscribe();

    const request = http.expectOne({ method: 'POST', url });
    expect(request.request.body).toEqual({ name: 'The Flat', timeZone: browserTimeZone() });
    request.flush(household, { status: 201, statusText: 'Created' });
  });

  it('passes other errors through', () => {
    let failed = false;
    service.load().subscribe({ error: () => (failed = true) });

    http.expectOne(url).flush(null, { status: 500, statusText: 'Server Error' });

    expect(failed).toBe(true);
  });

  it('joins with an invite code', () => {
    service.join('k7qm-3xrp').subscribe();

    const request = http.expectOne(`${url}/join`);
    expect(request.request.body).toEqual({ inviteCode: 'k7qm-3xrp' });
    request.flush(household);
  });

  it('formats invite codes in two groups of four', () => {
    expect(formatInviteCode('K7QM3XRP')).toBe('K7QM-3XRP');
  });
});
