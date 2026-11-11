/** Calendar dates as yyyy-mm-dd strings, worked out in local time (no time-zone shifts). */

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fromIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** The Sunday on or before the date. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -fromIsoDate(iso).getDay());
}

/** "Nov 8 – 14, 2026", "Nov 29 – Dec 5, 2026" or "Dec 27, 2026 – Jan 2, 2027" */
export function weekLabel(from: string, to: string): string {
  const start = fromIsoDate(from);
  const end = fromIsoDate(to);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const monthDay = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startText = sameYear ? monthDay(start) : `${monthDay(start)}, ${start.getFullYear()}`;
  // "Nov 8 – 14, 2026": the month isn't repeated within one month
  const endText = `${sameMonth ? end.getDate() : monthDay(end)}, ${end.getFullYear()}`;
  return `${startText} – ${endText}`;
}

/** "Wednesday, Nov 11" */
export function dayLabel(iso: string): string {
  return fromIsoDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
