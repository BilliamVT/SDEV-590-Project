# 0007 – Stale screens and simultaneous changes

- **Status:** Accepted
- **Date:** 2026-11-15
- **Sprint:** 4 (spike BILLIAMVT-52, 2-hour timebox)

## Context

Several people share a household, often on their phones at the same time. Two questions came up during BILLIAMVT-51:

1. **Stale screens.** Each screen shows what it last loaded. Nothing updates until a reload or a week change, so if Pat marks a task done, Sam's phone still shows it pending. If Sam then acts on a row Pat already deleted, Sam sees "Occurrence not found" next to the row, and the week isn't refreshed.
2. **Simultaneous saves.** Each request is its own transaction and generation is idempotent, but a code review found writes that could overwrite each other.

The constraints are the same as for the rest of the app: one household of two or three people, a free Render instance that sleeps after 15 minutes, and about two weeks left before the course ends.

## Findings

### The races, checked against the code

| # | What happens | How likely | Checked |
|---|---|---|---|
| 1 | **A pause or edit is undone by someone viewing the week.** `GET /api/schedule` loads every active task and saves its `generated_through` date. Hibernate saves the whole row, so a pause, rename or rule change committed in the meantime is written back to the old values. A paused task becomes active again. | Rare: it needs a pause or edit within the same fraction of a second as someone loading the week. But it's silent, and it's what the household will do most: open the app. | **Reproduced** with a throwaway test: after the pause committed, the task was active again. |
| 2 | **A backlog item ends up on two days.** Scheduling an item and marking it done at the same moment both see it as open, and each adds its own day. | Very rare: both members have to act on the same item at once. | Code reading |
| 3 | **A move and a status change overwrite each other** (new with BILLIAMVT-27). Both load the whole occurrence, so a move can undo a "done", or a done day can be moved. | Rare, and only once drag-and-drop (BILLIAMVT-28) is on. | Code reading |

Two people editing the same task's form at the same time: the last save wins. That's normal for a shared list and not worth preventing.

### Keeping screens current: options

| Option | Fit | Cost |
|---|---|---|
| **A. Refresh when the app comes back into view** (`visibilitychange`/focus) and when an action fails because the data changed | Covers how the app is actually used: open it, glance, tick something, put the phone away. Also the only way to refresh once the app runs full screen from the home screen (BILLIAMVT-53), which has no reload button. | Front end only, no new infrastructure. Requests are only made when someone opens the app, so the sleeping instance behaves as it does now. |
| B. Polling every 30–60 s while visible | Changes appear while both phones are open on the week. | More requests while the app is open, and it keeps the instance awake. Easy to add on top of A later. |
| C. Server-sent events | Near-instant updates. | A long-lived connection per open phone, a broadcast mechanism on the server, and reconnecting after the instance sleeps or the phone locks. |
| D. WebSockets | Same as C, both ways. | Most complex. Nothing in the app needs two-way messages. |

A chore list tolerates minutes of staleness: what matters is seeing the current state when you open it, and not acting on something that already changed.

### Simultaneous saves: options

| Option | Fit |
|---|---|
| **Row locks** (`SELECT … FOR UPDATE`, `@Lock(PESSIMISTIC_WRITE)` on the queries that load a task or occurrence to change it, including generation) | The second request waits a few milliseconds, then sees the committed change and acts on it. Postgres re-checks the query's conditions on the locked row, so a task paused in the meantime drops out of generation. Nobody sees an error. At this scale the waits are negligible. |
| Optimistic locking (`@Version`, 409) | Built for long edits by many people. Here it would make **viewing** the week fail with a conflict, because viewing writes `generated_through`, and every caller would need retry logic. |
| Saving only changed columns (`@DynamicUpdate`) | Fixes the overwrite in #1, but not a paused task getting new days generated, or #2. |
| Last write wins (today) | Leaves #1, which silently undoes what someone did. |

## Decision

1. **Lock rows on every write path** (BILLIAMVT-54). Load a task or occurrence with a pessimistic write lock wherever it's about to change: generation, edit, pause, resume, delete, backlog schedule/done, status change and move. Cover each race with a test that reproduces it first. **Do before household rollout** (BILLIAMVT-31), because race #1 undoes a pause without anyone noticing.
2. **Refresh when the app comes back into view, and after a stale action** (BILLIAMVT-55). Reload the week and backlog when the app becomes visible again, silently: a change appearing isn't an error, which is how shared-list apps behave. When an action fails because the row changed or disappeared (404 or 409), reload and show a short notice, also announced to screen readers. The notice says what happened and what the app did, without guessing why:
   - **Name the person only when the app knows for certain who made the change.** Only marking done or skipped records who did it (`completed_by`), so: "Sam already marked this done. Your week is up to date." or "You already…" when it was the same account, e.g. on another device.
   - **Otherwise neutral**, because deletes, moves, renames and pauses don't record who made them: "That task was already removed. Your week is up to date." or "Your week has changed since it was loaded, so it's been updated." A deleted member's completion is neutral too.

   **Do before household rollout**, and before or together with the home-screen app (BILLIAMVT-53).
3. **No polling, server-sent events or WebSockets for now.** Revisit if household feedback (BILLIAMVT-32) says changes take too long to show; polling while visible (option B) is the next step.

## Consequences

- Two requests touching the same task or occurrence run one after the other instead of at the same time. That's invisible at household scale.
- A screen can still be out of date while it stays open. The household sees the latest state each time they come back to the app, and an action on something that changed reloads the week instead of leaving an error.
- Each race gets a regression test, so later stories (drag-and-drop, dependencies) can't bring them back unnoticed.

## Revisit if

- Feedback says changes take too long to appear: add polling while visible.
- The app gets more than a few users per household, or long-running edits: reconsider optimistic locking.
- Hosting moves off a sleeping free instance: server-sent events become cheaper.
