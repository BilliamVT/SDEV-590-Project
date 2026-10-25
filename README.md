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

Every push to `main` that changes `backend/` deploys automatically to [Render](https://render.com) once CI passes, using `backend/Dockerfile`. The database is Postgres on [Neon](https://neon.com); Render supplies the connection through the `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` environment variables.

- Live health check: https://sdev-590-project.onrender.com/actuator/health
- The free instance sleeps after 15 minutes without traffic, so the first request after that takes about 45 seconds.

[Decision 0001](docs/decisions/0001-hosting-and-database.md) explains why these services were chosen.
