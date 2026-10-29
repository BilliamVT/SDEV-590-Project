# 0004 – Authentication

- **Status:** Accepted
- **Date:** 2026-10-28
- **Story:** BILLIAMVT-20 (Sprint 2)

## Context

Users register and log in so a household's data is private. The front end (`billiamvt.github.io`) and the API (`sdev-590-project.onrender.com`) are on **different sites**, so a cookie set by the API is a third-party cookie from the page's point of view. Safari (including every browser on iOS), Firefox and Brave block third-party cookies by default. The household will mostly use the app on iPhones.

Other constraints:

- Users shouldn't have to log in often, especially on phones.
- A deleted account (BILLIAMVT-41) must stop working right away.
- No extra paid services or infrastructure.

## Options considered

| | A. Session cookie | B. JWT in an `Authorization` header | C. Server session, ID in a header (Spring Session JDBC) |
|---|---|---|---|
| Works from GitHub Pages to Render | No on Safari/iOS (third-party cookie), unless both moved to one custom domain (~$10–15/yr) | Yes | Yes |
| Logout and revocation | Immediate, server-side | Token valid until it expires; the server keeps no list of tokens | Immediate (delete the session row) |
| New setup | – | A signing secret in Render's environment | A migration for Spring Session's tables and a dependency |
| Common for a single-page app plus API | When both share a domain | The most common pattern | Less common |

## Decision

Use **B: JWTs**, issued and validated with Spring Security's built-in support:

- `POST /api/auth/register` and `POST /api/auth/login` return a signed JWT (HS256). The subject is the user's ID; it expires after **30 days**.
- Every other `/api/**` endpoint requires `Authorization: Bearer <token>`, validated by Spring Security's OAuth2 Resource Server (`spring-boot-starter-oauth2-resource-server`), with tokens signed by Spring's `JwtEncoder`. No hand-written token code.
- **On every request the user is loaded from the token's ID.** If the account no longer exists, the request is rejected, so a deleted account stops working immediately.
- Passwords are hashed with BCrypt (Spring Security's default `DelegatingPasswordEncoder`).
- The front end keeps the token in `localStorage` and sends it from an HTTP interceptor. Logging out discards it.
- The signing secret comes from the `APP_JWT_SECRET` environment variable in production, never from the repo.

## Rationale

- **Works on every browser** the household uses, because a header isn't a cookie.
- **Industry standard and directly relevant to work**, which also uses JWTs.
- **No server-side session state**, which fits a free instance that sleeps and restarts.
- **The per-request user lookup closes JWT's main gap** for this app (deleted accounts). The app needs the user on most requests anyway, to scope data to their household.

## Consequences

- **A stolen token works until it expires** (up to 30 days), and logging out only removes it from that browser. Accepted for a two-person household app. Mitigations if needed later: a shorter lifetime with refresh tokens, or a token version on the user that can be bumped to revoke all their tokens.
- **Changing `APP_JWT_SECRET` logs everyone out**, which doubles as an emergency "revoke all tokens" switch.
- **Tokens in `localStorage` are readable by any script on the page**, so the app must not have cross-site-scripting holes. Angular escapes template output by default; never bypass its sanitization.
- **CSRF protection isn't needed** for the API: browsers don't send `Authorization` headers automatically the way they send cookies.
- **No rate limiting on login** yet. Acceptable for the MVP; revisit if the app is ever public beyond the household.

## Revisit if

- The app gets users outside the household, or handles more sensitive data: add refresh tokens and shorter lifetimes, and rate-limit login.
- Front end and API move under one custom domain, which would make cookie sessions (A) workable.

## Sources

- [Spring Security reference: OAuth 2.0 Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
- [RFC 7519: JSON Web Token](https://www.rfc-editor.org/rfc/rfc7519)
- [stape.io: Chrome cookie changes; Safari and Firefox already block third-party cookies](https://stape.io/news/google-chrome-cookie-deprecation)
