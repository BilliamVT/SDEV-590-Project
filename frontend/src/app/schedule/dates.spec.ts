import { addDays, dayLabel, startOfWeek, weekLabel } from './dates';

describe('dates', () => {
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
