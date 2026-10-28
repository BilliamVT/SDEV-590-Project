# Housework Scheduler

An app for scheduling recurring housework that a household shares: you enter recurring chores and the app generates a schedule for everyone. This is an MVP built as the SDEV 590 capstone at Champlain College.

## Repository layout

```
backend/             Spring Boot API (Java 25, Maven)
docker-compose.yml   Local Postgres for development
docs/decisions/      Decision records from spikes
```

## Prerequisites

- JDK 25 (check with `java -version`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), running. The local database and the tests both use it.

You don't need to install Maven. The project includes the Maven wrapper (`./mvnw`), which is what CI and the Docker build use. A globally installed `mvn` works too.

## Run locally

Start the local Postgres database from the repo root:

```bash
docker compose up -d
```

Then start the app from the `backend/` directory:

```bash
./mvnw spring-boot:run
```

The app starts on port 8080. To check that it's up:

```bash
curl http://localhost:8080/actuator/health
```

You should get `{"status":"UP",...}` with HTTP 200. If Postgres isn't running, the status is `DOWN`.

To use a different port, set the `PORT` environment variable (for example `PORT=9090 ./mvnw spring-boot:run`).

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
./mvnw verify
```

Tests run against a throwaway Postgres 18 container started by [Testcontainers](https://testcontainers.com), so Docker must be running. The Compose database isn't needed.

## Build and run the jar

```bash
./mvnw package
java -jar target/housework-api-0.0.1-SNAPSHOT.jar
```

## Deployment

Every merge to `main` deploys the backend to [Render](https://render.com), using `backend/Dockerfile`. The database is Postgres on [Neon](https://neon.com); Render supplies the connection through the `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` environment variables.

How a merge reaches production:

1. **CI** (`.github/workflows/ci.yml`) builds and tests the merge commit on `main`.
2. **Deploy** (`.github/workflows/deploy.yml`) runs when CI passes. It asks Render's API to deploy that exact commit, waits until the deploy is live, then checks `/actuator/health`. Flyway migrations run when the new version starts.
3. The Deploy run passes only if the new version is live and healthy. A failed build, a failed start, or a failed health check shows as a failed run in the **Actions** tab, and Render keeps the previous version running.

To redeploy without a merge, for example after changing an environment variable on Render, open **Actions → Deploy → Run workflow** on `main`.

The workflow needs two repository secrets: `RENDER_API_KEY` (from Render's Account Settings) and `RENDER_SERVICE_ID` (the `srv-...` ID of the web service). Render's own auto-deploy is turned off so each merge deploys once.

- Live health check: https://sdev-590-project.onrender.com/actuator/health
- The free instance sleeps after 15 minutes without traffic, so the first request after that takes about a minute.

### Hotfixes

Add the `hotfix` label to any PR that fixes a problem in production. The delivery metrics use it to count deploys that shipped a defect (change failure rate), so a missing label undercounts failures.

[Decision 0001](docs/decisions/0001-hosting-and-database.md) explains why these services were chosen.
