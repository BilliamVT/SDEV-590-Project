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

  it('renames the household', () => {
    service.update({ name: 'The Flynn House' }).subscribe();

    const request = http.expectOne({ method: 'PATCH', url });
    expect(request.request.body).toEqual({ name: 'The Flynn House' });
    request.flush(household);
  });

  it('joins with an invite code', () => {
    service.join('k7qm-3xrp').subscribe();

    const request = http.expectOne(`${url}/join`);
    expect(request.request.body).toEqual({ inviteCode: 'k7qm-3xrp' });
    request.flush(household);
  });

  it("remembers the household's time zone for its today, and follows a join to another (BILLIAMVT-51)", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 3 AM UTC on Nov 12: Nov 11 in New York, Nov 12 in Tokyo
    vi.setSystemTime(new Date(Date.UTC(2026, 10, 12, 3)));
    try {
      expect(service.timeZoneKnown()).toBe(false);

      service.load().subscribe();
      http.expectOne(url).flush(household);
      expect(service.timeZoneKnown()).toBe(true);
      expect(service.today()).toBe('2026-11-11');

      service.join('k7qm-3xrp').subscribe();
      http.expectOne(`${url}/join`).flush({ ...household, timeZone: 'Asia/Tokyo' });
      expect(service.today()).toBe('2026-11-12');

      // No household any more (e.g. another user logs in on this device)
      service.load().subscribe();
      http.expectOne(url).flush(null, { status: 404, statusText: 'Not Found' });
      expect(service.timeZoneKnown()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats invite codes in two groups of four', () => {
    expect(formatInviteCode('K7QM3XRP')).toBe('K7QM-3XRP');
  });
});
