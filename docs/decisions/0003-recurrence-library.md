# 0003 – Recurrence library

- **Status:** Accepted
- **Date:** 2026-10-28
- **Sprint:** 2 (spike, 2-hour timebox)

## Context

Each task stores an iCalendar recurrence rule (RFC 5545 `RRULE`, e.g. `FREQ=WEEKLY;BYDAY=SA`) and a start date (`task.starts_on`, V1 migration). Schedule generation (BILLIAMVT-38) has to turn a rule plus its start date into concrete dates **for a date window**: generation runs on demand, from the last generated date up to at least 4 weeks ahead. This is the core scheduling logic, so it is covered by the 80% coverage target and by risk R4.

The MVP needs these frequencies (BILLIAMVT-21): daily, weekly on a chosen day, monthly, quarterly, and a custom interval. The calendar feed (BILLIAMVT-33, stretch) will need to write iCalendar output.

## Options considered

| | Latest release | License | Size (with dependencies) | API |
|---|---|---|---|---|
| **A. ical4j** `org.mnode.ical4j:ical4j` | **4.4.0, Oct 2026** | BSD-3-Clause | ~3 MB (ical4j, commons-lang3, commons-codec, threeten-extra, slf4j-api) | `java.time`: `new Recur<LocalDate>(rule).getDates(startsOn, from, to)` |
| **B. lib-recur** `org.dmfs:lib-recur` | 0.17.1, Apr 2024 | Apache-2.0 | ~330 KB | Its own `DateTime` type (0-based months); iterate from the start and filter the window yourself |
| **C. biweekly** `net.sf.biweekly:biweekly` | 0.6.8, Jan 2024 | BSD-2-Clause | not tested | Mainly an iCalendar parser; not evaluated further |
| **D. Write it ourselves** with `java.time` | – | – | – | Has to handle intervals, month-end and window maths by hand |

## Hands-on comparison

The same rules, run through A and B in a throwaway project on JDK 25 (window dates are inclusive):

| Rule | Start | Window | Result (A and B identical) |
|---|---|---|---|
| `FREQ=WEEKLY;BYDAY=SA` | Wed 2026-10-28 | Nov 1–30 | Nov 7, 14, 21, 28 |
| `FREQ=DAILY` | 2026-10-28 | Nov 1–5 | Nov 1, 2, 3, 4, 5 |
| `FREQ=WEEKLY;INTERVAL=2;BYDAY=SA` | 2026-10-28 | Nov 1 – Dec 31 | Nov 14, 28, Dec 12, 26 |
| `FREQ=DAILY;INTERVAL=10` | 2026-10-28 | Nov 1 – Dec 15 | Nov 7, 17, 27, Dec 7 |
| `FREQ=MONTHLY;INTERVAL=3` (quarterly) | 2026-11-15 | Nov 2026 – Dec 2027 | 2026-11-15, 2027-02-15, 05-15, 08-15, 11-15 |
| `FREQ=MONTHLY;BYMONTHDAY=31` | 2026-10-31 | Nov – Mar | Dec 31, Jan 31, Mar 31 (**months without a 31st are skipped**) |
| `FREQ=MONTHLY;BYMONTHDAY=-1` (last day) | 2026-10-31 | Nov – Mar | Nov 30, Dec 31, Jan 31, **Feb 28**, Mar 31 |
| `FREQ=WEEKLY;BYDAY=SA`, start not a Saturday | Wed 2026-10-28 | Oct 25 – Nov 8 | Oct 31, Nov 7 (the non-matching start date is not an occurrence) |
| `FREQ=WEEKLY;BYDAY=SA`, window far from start | 2026-10-28 | Mar 2027 | Mar 6, 13, 20, 27 |
| `FREQ=FORTNIGHTLY` (invalid) | – | – | A: `IllegalArgumentException`; B: `InvalidRecurrenceRuleException` |

Both libraries are correct on every case, so the choice comes down to maintenance, API fit, and reuse.

## Decision

Use **ical4j 4.4.0** (Option A), behind a small interface of our own (e.g. `RecurrenceCalculator.datesBetween(rule, startsOn, from, to)`).

## Rationale

- **Maintained.** Released this month; lib-recur's last release was April 2024 and biweekly's January 2024. This app should keep working after the course.
- **Fits the design directly.** `getDates(startsOn, from, to)` takes and returns `LocalDate`, and the window arguments match on-demand generation (BILLIAMVT-38) with no manual iterating or date conversion.
- **Covers the calendar feed too.** ical4j writes iCalendar files, so BILLIAMVT-33 needs no second library.
- **Size is acceptable.** ~3 MB of jars against lib-recur's ~330 KB, which is small next to Spring Boot.
- **Not writing it ourselves (D):** the month-end and interval cases above are exactly the edge cases R4 warns about; a tested library already handles them.
- **The interface keeps the choice reversible.** Our scheduling code and its unit tests depend on `RecurrenceCalculator`, not ical4j, so swapping to lib-recur later touches one class.

## Consequences

- **Keep the rule options limited (R4).** The task form builds the rule from a fixed menu; users never type RRULE text:

  | Form choice | Stored rule |
  |---|---|
  | Daily | `FREQ=DAILY` |
  | Weekly on a day | `FREQ=WEEKLY;BYDAY=SA` |
  | Every N days / weeks | `FREQ=DAILY;INTERVAL=N` or `FREQ=WEEKLY;INTERVAL=N;BYDAY=SA` |
  | Monthly on day 1–28 | `FREQ=MONTHLY;BYMONTHDAY=15` |
  | Monthly on the last day | `FREQ=MONTHLY;BYMONTHDAY=-1` |
  | Quarterly | `FREQ=MONTHLY;INTERVAL=3` (on the start date's day) |

- **Month-end:** offer days 1–28 plus "last day of the month" (`BYMONTHDAY=-1`), so no month is silently skipped. Note this in BILLIAMVT-21.
- **Validation:** an invalid rule throws, so the API validates the rule when a task is saved (BILLIAMVT-21), never during generation.
- **Testing:** the cases above become unit tests of `RecurrenceCalculator` in BILLIAMVT-38, counting toward the 80% coverage target.

## Revisit if

- ical4j stops being maintained, or a security issue appears in it or its dependencies.
- Its size measurably slows startup (cold start is already ~63 s).

## Sources

- Maven Central metadata for [ical4j](https://repo.maven.apache.org/maven2/org/mnode/ical4j/ical4j/maven-metadata.xml), [lib-recur](https://repo.maven.apache.org/maven2/org/dmfs/lib-recur/maven-metadata.xml) and [biweekly](https://repo.maven.apache.org/maven2/net/sf/biweekly/biweekly/maven-metadata.xml) (checked 2026-10-28)
- [ical4j on GitHub](https://github.com/ical4j/ical4j): 4.x requires Java 11+ and uses the `java.time` API
- [RFC 5545, section 3.3.10 (RRULE)](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.10)
