# ADR-002: Migrate HTTP Composition With a Fastify Strangler

## Status

Accepted

## Context

The native `node:http` server has stable domain-service boundaries, but route composition, validation, rollout control, and HTTP integration tests need a framework-level contract. Rewriting domain services or switching every route at once would combine behavior risk with infrastructure risk.

## Decision

Fastify becomes the target HTTP composition layer through additive route slices. A native dispatcher remains the outer listener during migration and sends only an explicit method/path allowlist to Fastify; every other request continues through the legacy handler without Fastify consuming its body.

The order is:

1. Liveness, readiness, and read-only prompt access.
2. Authenticated student-workspace routes.
3. Authentication, administrator routes, and asynchronous AI jobs.
4. Static/React delivery only after API parity and browser flows are stable.

Each slice must provide Fastify response schemas, `inject()` tests, live fallback tests, the existing security headers and request-id behavior, and a feature-flagged percentage rollout. URLs, cookies, CSRF semantics, rate limits, unified error payloads, and domain services remain unchanged.

## Rollout And Rollback

- `FASTIFY_HTTP_ENABLED=false` is the safe default and immediately returns all traffic to the native handler.
- `FASTIFY_HTTP_TRAFFIC_PERCENT` selects 0-100 percent deterministically using request id, session cookie, or remote address.
- Structured HTTP logs and OTel spans include `httpLayer=native|fastify` for parity and SLO comparison.
- Removing legacy handlers is a separate decision after contract, Playwright, and production observation gates pass.

## Consequences

The application temporarily has two HTTP adapters, but only one owns any given request. Domain logic is not duplicated. Fastify plugins and schemas can grow route by route, while rollback remains an environment change instead of a redeploy or database operation.
