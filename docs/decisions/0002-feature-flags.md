# 0002 – Feature flags

- **Status:** Accepted
- **Date:** 2026-10-25
- **Sprint:** 1 (spike, 2-hour timebox)

## Context

Every merge to `main` deploys to production, so unfinished features have to be hidden behind flags. The first one is drag-and-drop rescheduling (a proposal objective), and task dependencies come later.

What the flags need to do:

- **Release toggles only.** A flag is off in production and on locally while a feature is being built. It's deleted once the feature ships.
- **Work in both layers.** The backend decides whether a flag is on. The API rejects requests to unreleased endpoints, and the Angular UI hides unreleased controls.
- **Fit a tiny scale.** There's one household and two users, so no percentage rollouts, A/B tests or per-user targeting.
- **Cost nothing and add no infrastructure.** Render's free tier allows one service.

## Options considered

| | Cost | Extra infrastructure | Changing a flag | Effort |
|---|---|---|---|---|
| **A. Spring config** (`@ConfigurationProperties`, overridden by env vars) | $0 | None | Edit the Render env var, which restarts the app (~45–70 s) | About 1 hr |
| **B. Database table** | $0 | One Flyway migration, plus caching | SQL in Neon, takes effect immediately | A few hrs |
| **C. Unleash** | Free self-hosted; hosted is about $75 per seat per month | A second service with its own Postgres, which doesn't fit Render's free tier | Admin UI, takes effect immediately | A day or more |
| **D. OpenFeature + flagd** | $0 | A flagd sidecar process | Edit the JSON and redeploy | Half a day or more |

Togglz, a popular Java flag library, was also looked at, but I couldn't confirm it supports Spring Boot 4.

## Decision

Use **Option A, Spring Boot configuration properties**, behind a small `FeatureFlags` interface.

## Rationale

- **It's the simplest thing that works.** Release toggles change about once per feature, so a one-minute restart to flip one is fine.
- **No new infrastructure or cost.** It's plain Spring Boot, and env vars on Render are already how the app is configured.
- **Easy to test.** Tests can turn a flag on or off with `@TestPropertySource` or `@SpringBootTest(properties = ...)`, with no database or mock server needed.
- **Transferable.** `@ConfigurationProperties`, profiles and env-var overrides are standard Spring Boot, so this is directly useful for work projects that are moving to Spring Boot.
- **Easy to change later.** Code calls the `FeatureFlags` interface, not the properties class, so moving to B or D later means writing one new implementation.

## How it works

**Backend**

```java
@ConfigurationProperties("features")
public record FeatureProperties(boolean dragDrop, boolean taskDependencies) {}
```

- Flags default to `false` in `application.properties`, so production is safe by default.
- An `application-local.properties` profile turns them on for development (`SPRING_PROFILES_ACTIVE=local`).
- Production overrides come from Render env vars. Spring's relaxed binding maps `FEATURES_DRAGDROP=true` to `features.drag-drop`.
- Endpoints for unreleased features check the flag and return **404** when it's off, so the feature doesn't appear to exist.

**Frontend**

- `GET /api/features` returns the current flags, for example `{"dragDrop": false, "taskDependencies": false}`.
- Angular loads them once at startup, before the app renders, and hides controls for features that are off.

**Naming and lifecycle**

- Name a flag after the feature (`drag-drop`), not after the sprint or story.
- Every flag gets a removal step in the acceptance criteria of the story that ships its feature. Once the feature is live, delete the flag and the code paths for its off state.

## Consequences

- Flipping a flag in production restarts the app, which costs one cold-start-like delay.
- Flags apply to everyone, so a feature can't be turned on for one user first. If that becomes necessary, switch to Option B behind the same interface.
- The flag plumbing (the properties class, the interface, the endpoint and the Angular loader) gets built in the first story that needs a flag, which is drag-and-drop rescheduling.

## Revisit if

- A feature needs to be on for one user or household and not others.
- Flags need to change often enough that restarts become annoying.
- The number of flags grows to more than a handful, which would suggest they're being used for more than release toggles.

## Sources

- [Spring Boot reference: externalized configuration and relaxed binding](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Martin Fowler: Feature Toggles (release toggles)](https://martinfowler.com/articles/feature-toggles.html)
- [Unleash pricing summary (Costbench)](https://costbench.com/software/feature-flags/unleash/)
- [OpenFeature: Java SDK with Spring Boot](https://openfeature.dev/docs/tutorials/getting-started/java/spring-boot)
