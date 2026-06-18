# ADR-001: Keep Native HTTP Server And Extract Service Boundaries Incrementally

## Status

Accepted

## Date

2026-06-18

## Context

The application is a native Node.js HTTP server with static browser ESM pages, SQLite persistence, server-side auth, planning storage, RAG, DeepSeek-backed generation, exports, and admin dashboards. Replacing the server with a framework or moving files broadly would create path and routing risk while the product is still being production-hardened.

The current `server.mjs` still owns too much behavior: routing, auth cookies, CSRF, static files, DeepSeek plan generation, job orchestration, admin dashboard orchestration, account export/delete assembly, and route access policy.

## Decision

Keep `server.mjs` as the native HTTP adapter and extract business behavior into focused service modules incrementally. New service boundaries must follow the ownership matrix in `docs/ARCHITECTURE_BOUNDARIES.md`.

## Alternatives Considered

### Replace Native Server With Express

- Pros: Familiar middleware and routing model.
- Cons: Introduces framework migration risk, changes error and static-file behavior, and does not by itself clarify domain boundaries.
- Rejected because the current production-hardening work is better served by small verified extractions.

### Leave server.mjs As The Main Application Object

- Pros: No migration work.
- Cons: Continued growth makes permission, AI, export, admin, and static-file behavior harder to reason about and test independently.
- Rejected because industrialization requires explicit boundaries before PostgreSQL or larger product expansion.

### Big-Bang Service Rewrite

- Pros: Faster-looking cleanup.
- Cons: High regression risk across auth, static page paths, CSRF, AI job routes, and protected runtime data files.
- Rejected in favor of vertical slices with targeted tests and full `npm run verify`.

## Consequences

- `server.mjs` remains the HTTP composition root.
- Service modules own business decisions and persistence orchestration.
- Domain modules remain pure and testable without a server.
- Boundary drift is checked by `tests/architecture-boundaries.test.mjs`.
- Future PostgreSQL work should wait until service/repository boundaries are clearer.
