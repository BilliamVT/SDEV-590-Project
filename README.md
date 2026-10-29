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

### Accounts and login

Create an account from the app's **Create an account** page; registering also logs you in. Login uses JWTs ([decision 0004](docs/decisions/0004-authentication.md)):

- `POST /api/auth/register` and `POST /api/auth/login` return a token valid for 30 days. The front end keeps it in the browser's `localStorage` and sends it as `Authorization: Bearer <token>`.
- Every other `/api/**` endpoint requires the token; `GET /api/me` returns the logged-in account. `/actuator/health` stays public.
- Logging out discards the token in the browser. A token stops working if its account is deleted.

The `local` profile includes a development-only signing secret, so no setup is needed locally.

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

Front-end tests (Vitest), from `frontend/`:

```bash
ng test
```

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

### Hotfixes

Add the `hotfix` label to any PR that fixes a problem in production. The delivery metrics use it to count deploys that shipped a defect (change failure rate), so a missing label undercounts failures.

[Decision 0001](docs/decisions/0001-hosting-and-database.md) explains why these services were chosen.
