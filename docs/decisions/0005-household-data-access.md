# 0005 – Household data access

- **Status:** Accepted
- **Date:** 2026-10-30
- **Story:** BILLIAMVT-37 (Sprint 2)

## Context

All of the app's data (tasks, occurrences, the backlog, completion history) belongs to a household, and only that household's members may see or change it. Every endpoint added from here on (BILLIAMVT-21, 22, 23, 25, 26, 38, 39 and later) has to enforce this the same way.

The most common way APIs leak data is an endpoint that trusts an ID from the request, e.g. `GET /api/households/7/tasks` or `GET /api/tasks/42`, without checking that the caller is allowed to see it (OWASP API Security Top 10: "Broken Object Level Authorization").

## Options considered

| | A. Household ID in the URL, checked by each endpoint | B. Household taken from the logged-in user | C. Row-level security in Postgres |
|---|---|---|---|
| How | `/api/households/{id}/tasks`; each endpoint checks membership | `/api/household`, `/api/tasks`; the server looks up the user's household | Database policies filter rows by a per-request setting |
| Risk of a leak | One forgotten check exposes another household's data | Nothing to forget for lists; lookups by ID must also filter by household | Low, but a misconfigured connection setting exposes everything |
| Fits the app | Needed only if a user could belong to several households | A user belongs to exactly one household (V1 schema) | Extra setup that's hard to test; unusual with Spring Data JPA |

## Decision

Use **B**. The household is always the logged-in user's own:

- **No household IDs in URLs or request bodies.** Household endpoints are singular (`/api/household`), and household data lives under plain paths (`/api/tasks`).
- **Lists** are queried by the user's household: `findAllByHouseholdId(user.getHouseholdId())`.
- **Lookups by ID** filter by household too: `findByIdAndHouseholdId(id, householdId)`. Another household's record returns **404**, exactly like a record that doesn't exist, so the API doesn't reveal which IDs exist.
- **Changes** (edit, complete, move, delete) load the record the same way before changing it.
- A user without a household gets 404 from household data endpoints; the front end asks them to create (and name) a household or join one with an invite code first (BILLIAMVT-37).
- **Every data story includes a test** that a second household's user gets 404 for the first household's records.

## Rationale

- **Secure by default.** Lists can't leak, and lookups by ID have one pattern to follow, which is easy to review.
- **Simpler API.** The front end never handles household IDs.
- **Matches the data model.** A user has one `household_id`; joining another household moves them (BILLIAMVT-37).

## Consequences

- Supporting several households per user later would mean adding household IDs to the URLs with membership checks (option A).
- **Joining another household moves the user.** If they were the last member of their old household, it's deleted along with its tasks; the front end warns before joining.
- **Invite codes** are the only way to join: 8 characters from an alphabet without look-alike characters, unique per household, no expiry. Any member can regenerate the code, which makes the old one stop working. No rate limiting on joining yet (same as login, decision record 0004).

## Sources

- [OWASP API Security Top 10 (2023): API1 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
