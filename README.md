# Housework Scheduler

An app for scheduling recurring housework that a household shares: you enter recurring chores and the app generates a schedule for everyone. This is an MVP built as the SDEV 590 capstone at Champlain College.

## Repository layout

```
backend/          Spring Boot API (Java 25, Maven)
docs/decisions/   Decision records from spikes
```

## Prerequisites

- JDK 25 (check with `java -version`)

You don't need to install Maven. The project includes the Maven wrapper (`./mvnw`).

## Run locally

From the `backend/` directory:

```bash
./mvnw spring-boot:run
```

The app starts on port 8080. To check that it's up:

```bash
curl http://localhost:8080/actuator/health
```

You should get `{"status":"UP",...}` with HTTP 200.

To use a different port, set the `PORT` environment variable (for example `PORT=9090 ./mvnw spring-boot:run`).

## Run tests

From `backend/`:

```bash
./mvnw verify
```

## Build and run the jar

```bash
./mvnw package
java -jar target/housework-api-0.0.1-SNAPSHOT.jar
```

## Deployment

Every push to `main` that changes `backend/` deploys automatically to [Render](https://render.com), using `backend/Dockerfile`. The database is Postgres on [Neon](https://neon.com).

- Live health check: https://sdev-590-project.onrender.com/actuator/health
- The free instance sleeps after 15 minutes without traffic, so the first request after that takes about 45 seconds.

[Decision 0001](docs/decisions/0001-hosting-and-database.md) explains why these services were chosen.
