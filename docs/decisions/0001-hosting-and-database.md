# 0001 – Hosting and database

- **Status:** Accepted
- **Date:** 2026-10-21
- **Sprint:** 1 (spike, 3-hour timebox)

## Context

The MVP needs somewhere to run the Spring Boot backend and a Postgres database. Constraints:

- **Cost:** free or nearly free. This is a student project with no budget.
- **Duration:** has to stay up through at least the end of the course (Dec 1, 2026). Ideally longer, since the household will keep using it.
- **Continuous deployment:** every merge to `main` deploys automatically from GitHub Actions.
- **Effort:** I'm the only developer and haven't provisioned cloud infrastructure before. Hosting setup shouldn't eat into sprint time for features.
- **Load:** tiny. One household (2 users) and a grader.

The frontend (Angular) is planned for GitHub Pages and is out of scope here.

## Option evaluated

**Render** (web service, free) **+ Neon** (Postgres, free)

| | Render + Neon |
|---|---|
| **Cost** | $0 with no expiry. Neon's free plan is permanent and needs no credit card. |
| **Setup effort** | Low. Connect the GitHub repo, Render builds the `Dockerfile`, set env vars. Neon gives you a connection string. |
| **Compute** | 512 MB RAM, 0.1 CPU. The next tier up is $7/mo for 0.5 CPU and the same 512 MB. |
| **Idle behavior** | Render spins down after 15 min with no traffic. Neon suspends compute after 5 min and resumes quickly. |
| **Database limits** | Neon: 1 GB storage and 100 CU-hours per project, 10 branches |
| **Other limits** | 750 free instance hours per month (enough for one service). Render's *own* free Postgres expires after 30 days, so it isn't an option. |
| **Observability** | Free tier shows logs and bandwidth only, with no memory or CPU metrics |
| **Deploy from GitHub** | Built in: auto-deploy on push, or a deploy hook called from Actions |

## Hands-on findings

A bare Spring Boot 4.1 skeleton (`backend/`: Web + Actuator, Java 25, multi-stage `Dockerfile`):

- Local startup (dev laptop): **0.7 s**, and `/actuator/health` returns `UP`.
- Render deploy (free instance, Ohio, Docker, commit `2b3a000`):
  - The first deploy worked as-is. The Dockerfile built, and the app bound to Render's injected `$PORT` (10000).
  - Timeline from commit to live: **~70 s**
    - Clone and Docker build: 28 s, including about 760 Maven dependency downloads
    - Container start until the JVM was running: 6 s
    - Spring Boot startup: **24.8 s**, about 35× the local time. The 0.1 CPU is the bottleneck.
    - Health check passing until the service was live: 7 s
  - Warm response time for `/actuator/health`: **~0.13 s**
  - Setup time, from a new account to a live URL: **~15 min**, slightly quicker than Neon
  - Cold start, first request after more than 15 min idle: **43.3 s** (HTTP 200)
  - Memory use: **not available on the free tier**. Render shows only bandwidth; memory and CPU metrics need a paid plan. The app hasn't been killed for running out of memory, so it fits within 512 MB for now.
- Neon:
  - Project `SDEV-590`, branch `production`, region AWS US East 2 (Ohio)
  - Postgres version: **18.6**, checked with `select version();` in the Neon SQL Editor
  - The connection uses the direct (non-pooled) endpoint in JDBC form with `sslmode=require&channelBinding=require`. Credentials are kept out of the repo.
  - Setup time, from signup to a working SQL Editor query: **~15 min**
  - Connection from Render works: deferred to Sprint 1 story 5, when the datasource is added

## Decision

Use **Render** (free web service, Docker runtime, Ohio) for the Spring Boot backend and **Neon** (free plan, AWS US East 2) for Postgres. Spring Boot stays as the backend framework.

## Rationale

- **Cost and duration.** Both free plans cost $0 and don't expire, so the app runs through the end of the course and afterwards for real household use.
- **Setup effort.** Each service took about 15 minutes to set up, and the first deploy worked without changes. That keeps sprint time on the scheduling features.
- **Spring Boot fits the free tier.** It starts in about 25 s on 0.1 CPU and serves warm requests in about 0.13 s. The worst case, a **43 s** cold start after 15 idle minutes, is acceptable for a 2-person household app. Before a demo, I can wake the service by opening it a few minutes ahead. Startup cost isn't a reason to switch frameworks.
- **CD fits.** Render deploys from GitHub on every merge to `main`, and its health check stops a broken build from going live.

## Consequences

- The backend is deployed as a Docker image. The `Dockerfile` caps the heap with `MaxRAMPercentage` to fit 512 MB.
- The app reads its port from `$PORT` and its DB credentials from environment variables. No secrets go in the repo.
- Neon branches can provide per-PR or test databases later if useful.
- Local Docker Compose and Testcontainers should use the `postgres:18` image so they match Neon.
- First requests after idle will be slow, so note this in the user/demo instructions.

## Revisit if

- Cold starts make real household use frustrating. Expect them to grow past 43 s as JPA, Flyway and more beans are added, so re-measure after Sprint 1 story 5. Next steps would be tuning startup (lazy init, CDS/AOT) or moving to Render's $7/mo instance (0.5 CPU and 512 MB, always on).
- Memory use approaches 512 MB as features are added. Since Render's free tier doesn't show memory, watch for out-of-memory restarts in the logs, or expose Actuator's `metrics` endpoint behind authentication once security is in place.
- Neon's free compute hours (100 CU-hours per month) start running out. Scale-to-zero after 5 idle minutes should keep usage low for one household.

## Sources

- Render free tier: https://render.com/docs/free
- Neon pricing: https://neon.com/pricing
