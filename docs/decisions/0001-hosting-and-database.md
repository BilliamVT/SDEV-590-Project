# 0001 – Hosting and database

- **Status:** Proposed <!-- change to Accepted once decided -->
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

## Options considered

1. **Render** (web service, free) **+ Neon** (Postgres, free)
2. **AWS** (new-account Free plan: e.g. App Runner or Elastic Beanstalk + RDS Postgres)

## Comparison

| | Render + Neon | AWS |
|---|---|---|
| **Cost** | $0 with no expiry. Neon's free plan is permanent and needs no credit card. | $100 credit at signup, plus up to $100 more for onboarding tasks. The Free plan closes after 6 months or when credits run out, then you pay. |
| **Setup effort** | Low. Connect the GitHub repo, Render builds the `Dockerfile`, set env vars. Neon gives you a connection string. | High. VPC, security groups, IAM roles, an RDS instance, a compute service, and budget alarms to avoid surprise bills. |
| **Compute** | 512 MB RAM, 0.1 CPU *(verify on Render's pricing page)* | t3.micro class, 1 GB RAM, always on |
| **Idle behavior** | Render spins down after 15 min with no traffic, and waking takes about 1 min. Neon suspends compute after 5 min and resumes quickly. | Always on |
| **Database limits** | Neon: 1 GB storage and 100 CU-hours per project, 10 branches | RDS micro instance, paid from credits |
| **Other limits** | 750 free instance hours per month (enough for one service). Render's *own* free Postgres expires after 30 days, so it isn't an option. | Credits and the plan end after 6 months, so the app needs paying for or tearing down |
| **Deploy from GitHub** | Built in: auto-deploy on push, or a deploy hook called from Actions | Possible, but you build it yourself (OIDC role, workflow, etc.) |
| **Resume / learning value** | Moderate | High |

## Hands-on findings

A bare Spring Boot 4.1 skeleton (`backend/`: Web + Actuator, Java 25, multi-stage `Dockerfile`):

- Local startup (dev laptop): **0.7 s**, and `/actuator/health` returns `UP`.
- Render deploy:
  - Setup time, from a new account to a live URL: _TODO_
  - Cold start, first request after more than 15 min idle: _TODO_
  - Warm response time for `/actuator/health`: _TODO_
  - Memory use (Render metrics): _TODO_ / 512 MB
- Neon:
  - Setup time: _TODO_
  - Connection from Render works (JDBC URL with `sslmode=require`): _TODO_

## Decision

_TODO: e.g. "Use Render (free web service, Docker) for the backend and Neon (free) for Postgres."_

## Rationale

_TODO: tie this back to the constraints above. Points to weigh:_

- Render + Neon costs nothing and doesn't expire, so it outlasts the course. AWS's 6-month or credit limit doesn't.
- Setup effort is far lower, which keeps sprint time on the scheduling features.
- The main downside is the cold start after 15 idle minutes. For a 2-person household app that's acceptable (and before a demo, you can wake it up in advance).
- AWS has more resume value, but it isn't worth the setup effort and billing risk within a 6-week MVP.

## Consequences

- The backend is deployed as a Docker image. The `Dockerfile` caps the heap with `MaxRAMPercentage` to fit 512 MB.
- The app reads its port from `$PORT` and its DB credentials from environment variables. No secrets go in the repo.
- Neon branches can provide per-PR or test databases later if useful.
- First requests after idle will be slow, so note this in the user/demo instructions.

## Revisit if

- Cold starts make real household use frustrating. Next steps would be tuning startup (lazy init, CDS/AOT) or moving to Render's paid always-on instance (~$7/mo, verify).
- Memory use approaches 512 MB as features are added.
- Neon's free compute hours (100 CU-hours) start running out.

## Sources

- Render free tier: https://render.com/docs/free
- Neon pricing: https://neon.com/pricing
- AWS Free Tier (new accounts, July 2025 onward): https://aws.amazon.com/free/
  (summarized in https://spot.rackspace.com/blog/aws-free-tier)
