# Housework Scheduler

An app for scheduling recurring housework that a household shares: you enter recurring chores and the app generates a schedule for everyone. This is an MVP built as the SDEV 590 capstone at Champlain College.

## Repository layout

```
backend/             Spring Boot API (Java 25, Maven)
frontend/            Angular web app (Angular 22, Node 24)
docker-compose.yml   Local Postgres for development
docs/decisions/      Decision records from spikes
```

## Prerequisites

- JDK 25 (check with `java -version`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running. The local database and the tests both use it.
- Node.js 24 LTS (`node --version`), for the front end. Install the Angular CLI with `npm install -g @angular/cli`.
- Maven 3.9+ (`mvn -version`). If you don't have Maven installed, use the included wrapper instead: replace `mvn` with `./mvnw` in the commands below. CI and the Docker build use the wrapper, so they need no Maven install.

## Run locally

Start the local Postgres database from the repo root:

```bash
docker compose up -d
```

Then start the app from the `backend/` directory:

```bash
mvn spring-boot:run
```

This runs with the `local` profile, which points the app at the Compose database (`application-local.properties`). If you start the app another way, such as an IntelliJ run configuration, set the active profile to `local` (or the environment variable `SPRING_PROFILES_ACTIVE=local`).

The app starts on port 8080. To check that it's up:

```bash
curl http://localhost:8080/actuator/health
```

You should get `{"status":"UP",...}` with HTTP 200. If Postgres isn't running, the status is `DOWN`.

To use a different port, set the `PORT` environment variable (for example `PORT=9090 mvn spring-boot:run`).

### Front end

From the `frontend/` directory, install dependencies once with `npm install`, then:

```bash
ng serve
```

Open http://localhost:4200. In development the app calls the backend at `http://localhost:8080`, so run the backend too (above); the `local` profile allows the dev server's origin (CORS). The API URL for each build is set in `frontend/src/environments/`. Keep the dev server on port 4200: that's the only local origin the backend allows.

**On a phone** (same Wi-Fi), run `npm run start:lan` from `frontend/` alongside the backend, and open `http://<your computer's IP>:4300` on the phone (on a Mac, `ipconfig getifaddr en0` prints the IP; allow `node` incoming connections if macOS asks). In this mode the app calls the API at its own address and the dev server forwards `/api` and `/actuator` to `localhost:8080` (`frontend/proxy.lan.json`), so the backend needs no CORS change. It's plain HTTP, so "Add to Home Screen" can't be fully tested this way; check that on the live site.

**On the home screen** (BILLIAMVT-53): in Safari on the live site, **Share → Add to Home Screen** installs the app with its icon; it opens full screen without Safari's bars, and content stays clear of the notch and home indicator (`viewport-fit=cover` with `env(safe-area-inset-*)`). On Android, Chrome offers **Install app**. The manifest is `frontend/public/manifest.webmanifest`, with relative paths so it works under GitHub Pages' `/SDEV-590-Project/`. The icons in `frontend/public/icons/` are exported from `icon.svg`, a house with a tick drawn inside the maskable safe zone, so one drawing serves every size; re-export the PNGs if it changes. There's **no service worker**, so the app doesn't work offline and always loads the latest deploy (decided in 53; revisit if household feedback asks for offline). Chrome DevTools **Application → Manifest** shows any install problems. A home-screen app has no reload button, so: when the week, backlog, task list or household fails to load, a **Try again** button appears under the error; and when the app comes back into view, it checks whether a newer version is deployed (by comparing the hashed `main-*.js` in `index.html`) and reloads to it, unless an action sheet is open or a form has unsaved changes (`frontend/src/app/shared/app-update.ts`).

**Styling** uses the app's own small design system ([decision 0006](docs/decisions/0006-design-system.md)): colors, spacing, type sizes and the shared button, field, notice and card styles are in `frontend/src/styles.scss`. Use those (`class="primary"`, `"danger"` or `"quiet"` on a button, `class="button"` on a link that acts like one, `var(--space-3)` and so on) rather than new values in a component, and keep every control at least `var(--touch)` (44 px) tall.

### Accounts and login

Create an account from the app's **Create an account** page; registering also logs you in. Login uses JWTs ([decision 0004](docs/decisions/0004-authentication.md)):

- `POST /api/auth/register` and `POST /api/auth/login` return a token valid for 30 days. The front end keeps it in the browser's `localStorage` and sends it as `Authorization: Bearer <token>`.
- Every other `/api/**` endpoint requires the token; `GET /api/me` returns the logged-in account. `/actuator/health` stays public.
- Logging out discards the token in the browser. A token stops working if its account is deleted.
- **Settings → Delete account** permanently deletes the account after asking for the password (`DELETE /api/me`). The household keeps tasks the user completed, without their name; if they were its only member, the household and its tasks are deleted too.

The `local` profile includes a development-only signing secret, so no setup is needed locally.

### Households

Everyone belongs to one household, which shares a schedule ([decision 0005](docs/decisions/0005-household-data-access.md)):

- After signing up, the home page asks you to **create a household** (you choose its name) or **join one** with an invite code. A new household uses the browser's time zone to decide what "today" is.
- **Settings → Household** then shows its members and its **invite code** to share. **New code** replaces the code, and the old one stops working.
- **Join another household** (also in Settings) moves you to a different one; if you were the only member of your old household, it's deleted (the app warns first). Any member can rename it under **Settings → Household** (`PATCH /api/household`).
- The API never takes a household ID: `/api/household` and later data endpoints always use the logged-in user's household, and another household's records return 404.

### Tasks

The home page shows the household's **week**, Sunday to Saturday, with today marked and overdue tasks labelled. Each task is a checklist row: tap the circle to mark it done (tap again to undo), and **⋯** for Move (a day picker in an action sheet), Assign, Skip, or Delete, which asks first and removes only that day; **‹ Previous**, **This week** and **Next ›** move between weeks, up to 2 years ahead. With the `drag-drop` flag on (BILLIAMVT-28), a pending day can also be dragged to another day of the shown week, from today on: press and hold it on a phone (a fifth of a second; taps and scrolling work as usual, and the page doesn't scroll while a row is dragged), or drag it with a mouse. After a move, a toast at the bottom confirms it with an **Undo** button (4 seconds, 6 with Undo, and it stays while touched; not for an overdue day moved forward, since days can't move into the past). Coming back to the app reloads the week and backlog, so changes made on another phone show up; if you tap something that had already changed, the week reloads and a short notice says what happened, naming the member only when the app knows who did it, e.g. "Sam already marked Vacuum done." ([decision 0007](docs/decisions/0007-stale-screens-and-concurrent-changes.md)). **Add a task** opens the New task form, and saving returns to the week with a toast, "Saved: Vacuum, every day.", that offers **Add another** (BILLIAMVT-57). Repeats also has **Never (one time)** (BILLIAMVT-59): pick a day, from today up to 2 years ahead, and the task goes straight onto it, without the backlog. It's a one-off item put on a day, so it behaves like a scheduled backlog item: deleting that day puts it back in the backlog. The form sends it as `POST /api/backlog` with an optional `date`, which the backend checks like scheduling and saves in one transaction, so a refused day creates nothing. Confirmations like this go away on their own; notices that explain something unexpected stay on the page. **Your tasks** lists the household's tasks, each with when it was last done and by whom ("Last done Thu, Nov 12 by Sam"; skipped days don't count, and the week view keeps each day's detail), where each can be edited (a changed schedule applies from today on; past, done and moved occurrences are kept), paused (no new occurrences; resuming continues the task's own rule from today without filling in the pause), or deleted after a confirmation (its past occurrences stay on the week as history; upcoming ones are removed). A task repeats on a fixed menu of schedules ([decision 0003](docs/decisions/0003-recurrence-library.md)): every day, every week on a day, every 2–90 days, every 2–52 weeks on a day, every month on day 1–28 or the last day, every 2–11 months, or every year (BILLIAMVT-60; every 3 months is now every few months with 3, and existing tasks keep their schedule). The form sends these choices to `POST /api/tasks`, and the backend builds and checks the RFC 5545 rule (e.g. `FREQ=WEEKLY;BYDAY=SA`); users never type rule text. Tasks belong to the logged-in user's household ([decision 0005](docs/decisions/0005-household-data-access.md)), and a task starts today in the household's time zone unless its schedule lets you pick a start date: the first time it's due, from today up to a year ahead. The form previews that first date ("First time: Sunday, Nov 15"); an every-N-weeks task starts on the first chosen weekday on or after the date.

Tasks become **occurrences** (one per date) on demand, with no nightly job, since the free Render instance sleeps. Creating a task generates its next 4 weeks (`app.schedule.weeks-ahead`), and `GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` generates whatever its range still needs and returns the household's occurrences with task names and an `overdue` flag (pending, before the household's today). Each task records how far it's been generated (`task.generated_through`), so days nobody viewed are still filled in and show as overdue. A request covers at most 6 weeks and at most 2 years ahead. Dates come from `RecurrenceCalculator` (ical4j behind an interface, decision 0003).

**Assigning** (BILLIAMVT-64): the New task form's **Assigned to** gives the whole task to a household member, or leaves it for Anyone (the default). A pending day shows its assignee's first name in teal ("Sam"; read as "Assigned to Sam"); Anyone shows nothing, and done or skipped days show who actually did them instead. **Assign** in a day's ⋯ menu gives just that day its own assignee, or Anyone, in an action sheet listing the members: `PUT /api/occurrences/{id}/assignee` with `{"assigneeId": 2}` or `{"assigneeId": null}`. A day changed this way keeps its assignee when the task's assignee changes later, and editing or pausing the task keeps the day, as with moved days; the other days follow the task. The toast after assigning ("Vacuum on Saturday: Sam.") has **Undo**, which puts the day back exactly as it was: a day that followed the task follows it again (`DELETE /api/occurrences/{id}/assignee`; each day's `assignmentSet` says whether it has its own assignee), and a day with its own assignee gets that one back. **Your tasks** shows each task's assignee the same way, and so does the backlog: **Assign** in a backlog item's ⋯ menu sets who it's for, in the same action sheet with Undo (`PUT /api/backlog/{id}/assignee`; the backlog list returns `assigneeId`), and once it's put on a day, the day follows it. The backlog's quick-add form stays one line, so an item is assigned after it's added. Only pending days of tasks that still exist can be assigned (409 otherwise), and only to members of the household (400). Tasks and days assigned to someone who leaves the household (joins another) or deletes their account go back to Anyone. Anyone can still mark any day done. Stored in `task.assigned_to` and `occurrence.assigned_to` / `assignment_set` (V5).

**Moving a day** (BILLIAMVT-27; in the ⋯ menu since BILLIAMVT-56): `PUT /api/occurrences/{id}/date` with `{"date": "YYYY-MM-DD"}` moves one pending occurrence to another day, from the household's today up to 2 years ahead (as far as the week can be viewed). The task's rule doesn't change, and the occurrence keeps its `originalDate`; moving it back there makes it a normal day again. Editing, pausing or resuming the task keeps the move, and deleting the task removes it. Done or skipped days, and a deleted task's days, can't be moved (409). Dragging a day to another day uses the same API (BILLIAMVT-28, behind the `drag-drop` flag).

### Feature flags

Unfinished features are hidden behind release toggles ([decision 0002](docs/decisions/0002-feature-flags.md)): `features.*` properties, **off by default**, so production is safe without any setup. The `local` profile and the tests turn them on. `GET /api/features` (no login) returns them, e.g. `{"dragDrop": false}`, and the front end loads them once at startup, treating them as off until they arrive or if the request fails. An endpoint for an unreleased feature should return 404 while its flag is off; none does at the moment, since the move API was released with BILLIAMVT-56.

| Flag | Property / Render env var | Feature |
|---|---|---|
| `dragDrop` | `features.drag-drop` / `FEATURES_DRAGDROP` | Dragging a day to another day in the week view (BILLIAMVT-28). **On in production since 2026-11-20** (`FEATURES_DRAGDROP=true` on Render; Change Log); the menu option and the API were released with BILLIAMVT-56. |

To turn one on in production, set its env var to `true` on Render (the app restarts, about a minute). Delete a flag and its off-state code once its feature ships.

## Database

Postgres 18 (matching production on Neon). Schema changes are [Flyway](https://documentation.red-gate.com/flyway) migrations in `backend/src/main/resources/db/migration/`, applied automatically when the app starts.

- **Add a schema change** as a new file, `V<next number>__<description>.sql`. Never edit a migration that has already run in production; Flyway checks a checksum of each applied file and refuses to start if one changes.
- **Connect with psql**, from the repo root:
  ```bash
  docker compose exec postgres psql -U housework -d housework
  ```
  Or use any database client with host `localhost`, port `5432`, and `housework` as the user, password, and database. These credentials are for local development only.
- **Stop it** with `docker compose stop`, and start it again with `docker compose start`. Data is kept in a Docker volume.
- **Reset it** (deletes all local data) with `docker compose down -v`, then `docker compose up -d`.

## Run tests

From `backend/`:

```bash
mvn verify
```

Tests run against a throwaway Postgres 18 container started by [Testcontainers](https://testcontainers.com), so Docker must be running. The Compose database isn't needed.

`mvn verify` also measures test coverage with [JaCoCo](https://www.jacoco.org/jacoco/) and **fails the build if any package's line coverage is below 80%** (the application's `main()` class is excluded). The threshold is `coverage.minimum` in `backend/pom.xml`; to try a different value for one run, use `mvn verify -Dcoverage.minimum=0.70`. The report is at `backend/target/site/jacoco/index.html`; in CI, download it from the run's **coverage-report** artifact.

Front-end tests (Vitest), from `frontend/`:

```bash
ng test
```

### End-to-end tests

[Playwright](https://playwright.dev) tests in `e2e/` drive the real app in **Chromium** and **WebKit** (Safari's engine, run as an iPhone): registering, logging in and out, sessions and page guards, login and registration errors, deleting an account; creating, joining and renaming a household, invite codes, and two members sharing the schedule; adding a task (including one on several days, and a one-time task on a day), assigning a task and a single day to a member, marking it done, skipping or deleting a day, editing, pausing and deleting a task; and every backlog action. `accessibility.spec.ts` runs [axe-core](https://github.com/dequelabs/axe-core) on every page in light and dark mode and fails on serious or critical problems (low contrast, missing labels and so on); the failure names the rule and the element. Add a test here when a story adds a new flow, and keep edge cases in the backend and front-end tests.

When writing a test, find elements the way a user does (`getByRole`, `getByLabel`) and use the helpers in `e2e/tests/helpers.ts`. Before typing into a form reached by a link inside the app, call `formReady(field)`: Playwright can type before Angular has set up the form, and Angular then clears the field.

A test for a known defect is marked `test.fail()` with a comment naming the bug's Jira key: it passes while the bug is there, and Playwright reports it as "passed unexpectedly" once the fix lands, the cue to remove the mark.

First time, from `e2e/`:

```bash
npm install
npx playwright install chromium webkit
```

Then, with the Compose database running (`docker compose up -d`):

```bash
npx playwright test
```

- If the backend (8080) and front end (4200) are already running, the tests use them and leave them running. Otherwise they start `mvn spring-boot:run` and `ng serve` and stop them afterwards.
- Each test signs up new users with random `e2e-…@example.test` emails, so they leave throwaway accounts in the local database. They're harmless; `docker compose down -v` clears everything, including your own test data.
- `npx playwright test --ui` opens an interactive runner; `npx playwright show-report` opens the last report.

In CI, the **End-to-end tests** job runs on every PR that changes `backend/`, `frontend/` or `e2e/`, against Postgres in a service container and the servers started inside the job (never production). It's a required check, so a failing test blocks merging. When it fails, download the run's **playwright-report** artifact and open it with `npx playwright show-report <folder>`; each failed test has a trace (`npx playwright show-trace <trace.zip>`) that steps through every action with screenshots.

### Smoke test (production)

After every successful deploy, the **Smoke test** workflow (`.github/workflows/smoke.yml`) checks production in Chromium and WebKit: it waits for the backend to wake up, logs in with a dedicated account, checks the week loads and Settings shows its household, and logs out; it also checks the manifest and icons load from the deployed paths (BILLIAMVT-53) (`e2e/smoke/`, config `e2e/smoke.config.ts`). It's **read-only**: it never registers, creates or changes anything. Run it by hand from **Actions → Smoke test → Run workflow**.

- **The smoke account:** "Smoke Test", in a household named "Smoke test" with **no tasks** (so viewing its week generates nothing). Its email and password are the `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` repository secrets; never commit them. Leave this household out of usage numbers (BILLIAMVT-31).
- **When it fails:** download the run's **smoke-report** artifact and open it with `npx playwright show-report <folder>`; each failure has a screenshot and a trace. A timeout while waiting for the backend is usually a slow cold start: re-run it. Otherwise check the app yourself, then Render's logs and the last deploy. A real break is fixed in a PR labelled `hotfix`.
- **Metrics:** a failed smoke test doesn't count as a failed deployment by itself; the `hotfix` label on the fix does (Change Log, 2026-11-18).
- **Locally**, from `e2e/`, with the account's details in your environment: `npx playwright test -c smoke.config.ts`. `SMOKE_BASE_URL` and `SMOKE_BACKEND_URL` point it somewhere else, such as `http://localhost:4200/` and `http://localhost:8080`.

## Build and run the jar

```bash
mvn package
SPRING_PROFILES_ACTIVE=local java -jar target/housework-api-0.0.1-SNAPSHOT.jar
```

Without the `local` profile (as in production), the jar needs the `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` environment variables. If they're missing, startup fails with Spring Boot's "Failed to configure a DataSource: 'url' attribute is not specified" report instead of trying to connect to localhost.

## Troubleshooting

- **"Failed to configure a DataSource: 'url' attribute is not specified"** at startup: the app has no database settings.
  - Locally: start Postgres with `docker compose up -d` and run with the `local` profile (`mvn spring-boot:run` does this).
  - On Render: set `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` under the service's **Environment**, then rerun **Actions → Deploy → Run workflow**.

- **"Binding to target ... JwtProperties failed ... Property: app.jwt.secret ... must not be blank"** at startup: the JWT signing secret is missing.
  - Locally: run with the `local` profile, which has a development secret.
  - On Render: set `APP_JWT_SECRET` (at least 32 characters, e.g. from `openssl rand -base64 32`) under the service's **Environment**, then rerun the Deploy workflow. Changing it logs everyone out.

## Deployment

The backend runs on [Render](https://render.com), built from `backend/Dockerfile`, with Postgres on [Neon](https://neon.com). Render supplies its configuration as environment variables:

| Variable | Purpose |
|---|---|
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | Neon database connection |
| `APP_JWT_SECRET` | Signs and verifies login tokens. At least 32 characters; never commit it. |

The front end is served by GitHub Pages at https://billiamvt.github.io/SDEV-590-Project/.

CI and deploys run only for the parts of the repo a change touches (`.github/scripts/changed-parts.sh`): `backend/`, `frontend/`, or both. Changes to the workflows count as both. A change that touches neither, such as this README, skips the builds and deploys nothing.

How a merge reaches production:

1. **CI** (`.github/workflows/ci.yml`) builds and tests the changed parts of the merge commit on `main`. On pull requests, "Backend build and test" and "Frontend build and test" are required checks; a skipped job counts as passing.
2. **Deploy** (`.github/workflows/deploy.yml`) runs when CI passes:
   - **Backend:** asks Render's API to deploy that exact commit, waits until it's live, then checks `/actuator/health`. Flyway migrations run when the new version starts.
   - **Front end:** builds the Angular app for `/SDEV-590-Project/` and publishes it to GitHub Pages.
3. The Deploy run passes only if every deploy it started succeeded. A failure shows as a failed run in the **Actions** tab, and the previous version keeps running.

To redeploy without a merge, for example after changing an environment variable on Render, open **Actions → Deploy → Run workflow** on `main`. A manual run deploys both parts.

The backend deploy needs two repository secrets: `RENDER_API_KEY` (from Render's Account Settings) and `RENDER_SERVICE_ID` (the `srv-...` ID of the web service). Render's own auto-deploy is turned off so each merge deploys once. GitHub Pages must have its source set to **GitHub Actions** (Settings → Pages).

- Live health check: https://sdev-590-project.onrender.com/actuator/health
- The free instance sleeps after 15 minutes without traffic, so the first request after that takes about a minute.

### Logs

Production logs are in Render: open the web service → **Logs**. Locally they're in the terminal running the backend.

- **Every API request** gets one line with its method, path, status and duration, e.g. `GET /api/household 200 12 ms` (`RequestLoggingFilter`). Health checks and CORS preflight requests are skipped, and query strings, headers, tokens and bodies are never logged.
- **Errors add a short reason** that never includes what the user typed, e.g. `POST /api/household/join 404 15 ms (invite code not found)`, `POST /api/auth/register 400 13 ms (invalid fields: email, password)`, or `GET /api/household 401 9 ms (no token)`. The response body still explains the error to the user. A `500` line also comes with Spring's stack trace; search for ` 500 ` to find them.
- **Account and household events** (registered, logged in, created or joined a household, deleted an account) are logged by user and household ID only, never by email or name.
- Slow responses right after a deploy or a cold start are expected on the free instance; a path that's slow every time is worth investigating.

### Hotfixes

Add the `hotfix` label to any PR that fixes a problem in production. The delivery metrics use it to count deploys that shipped a defect (change failure rate), so a missing label undercounts failures.

### Delivery metrics

Deployment frequency, lead time and change failure rate per sprint come from GitHub's history (`.github/scripts/delivery-metrics.mjs`; definitions at the top of the script). To get them, run **Actions → Delivery metrics → Run workflow**; the results are on the run's summary page. With no inputs it reports every sprint that has started, from `.github/scripts/sprints.json`. Later sprints are listed at their planned start (Wednesday, 1:30 PM Eastern); if one starts at a different time, correct its line. To report a different range, fill in the optional `from` and `to` inputs.

It also runs locally (Node 24), but without a token GitHub allows only 60 API requests an hour, about two runs:

```bash
node .github/scripts/delivery-metrics.mjs
```

Tests for the script: `node --test '.github/scripts/*.test.mjs'`.

### Household usage

The share of scheduled days the household completes, by week (BILLIAMVT-31), comes from a read-only query against production, `docs/metrics/completion-share.sql`. It runs in a read-only transaction, so Postgres refuses any write. Copy the **External Database URL** from Render (the Postgres instance → **Connect** → **External**) and run it with `psql`, or with Docker if `psql` isn't installed; never commit the URL, which contains the password:

```bash
docker run --rm -i postgres:18 psql "<external database URL>" < docs/metrics/completion-share.sql
```

It lists each household's weeks from the household's first full week, Sunday Nov 22 (Sunday to Saturday, as in the app) with the days due before today, done, skipped and missed. Copy the household's row into the **Household Usage** tab of the "Capstone Sprint Metrics" sheet, where the percentages are formulas. One-time tasks count when they were planned ahead (added with Never or scheduled from the backlog); one-offs logged after the fact ("Mark done" on an earlier day) and the smoke test's household are left out (reasons at the top of the query). Feedback from the household goes in the **Household Feedback** tab.

[Decision 0001](docs/decisions/0001-hosting-and-database.md) explains why these services were chosen.
