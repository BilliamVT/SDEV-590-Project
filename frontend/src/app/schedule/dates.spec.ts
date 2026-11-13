import { addDays, dayLabel, startOfWeek, todayIn, weekLabel } from './dates';

describe('dates', () => {
  it("works out today in a time zone, whatever the device's zone (BILLIAMVT-51)", () => {
    // 3 AM UTC on Nov 12: still the evening of Nov 11 in New York, already Nov 12 in Tokyo
    const now = new Date(Date.UTC(2026, 10, 12, 3));
    expect(todayIn('America/New_York', now)).toBe('2026-11-11');
    expect(todayIn('Asia/Tokyo', now)).toBe('2026-11-12');
    expect(todayIn('Pacific/Kiritimati', new Date(Date.UTC(2026, 11, 31, 11)))).toBe('2027-01-01');
  });

  it('starts weeks on Sunday', () => {
    expect(startOfWeek('2026-11-11')).toBe('2026-11-08'); // Wednesday
    expect(startOfWeek('2026-11-08')).toBe('2026-11-08'); // Sunday
    expect(startOfWeek('2026-11-14')).toBe('2026-11-08'); // Saturday
  });

  it('adds days across months, years and the end of daylight saving', () => {
    expect(addDays('2026-11-29', 7)).toBe('2026-12-06');
    expect(addDays('2026-12-27', 6)).toBe('2027-01-02');
    expect(addDays('2026-10-31', 7)).toBe('2026-11-07');
    expect(addDays('2026-11-08', -7)).toBe('2026-11-01');
  });

  it('labels weeks without repeating the month or year', () => {
    expect(weekLabel('2026-11-08', '2026-11-14')).toBe('Nov 8 – 14, 2026');
    expect(weekLabel('2026-11-29', '2026-12-05')).toBe('Nov 29 – Dec 5, 2026');
    expect(weekLabel('2026-12-27', '2027-01-02')).toBe('Dec 27, 2026 – Jan 2, 2027');
  });

  it('labels days', () => {
    expect(dayLabel('2026-11-11')).toBe('Wednesday, Nov 11');
  });
});
