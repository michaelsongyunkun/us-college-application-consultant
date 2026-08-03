# Architecture Boundaries

Created: 2026-06-18

## Decision Summary

Use the Fastify strangler defined by `docs/decisions/ADR-002-fastify-strangler-http-migration.md` to migrate HTTP composition route by route. During the transition, `server.mjs` remains the native dispatcher and static-file boundary, while `src/server/fastify-http-layer.ts` owns only its explicit allowlist. Product behavior stays in `src/server/` service modules or `src/domain/` pure modules, with tests at the same ownership level.

The guiding rule is: routes coordinate; services decide; domain modules calculate.

## Ownership Matrix

| Capability | Current owner | Allowed dependencies | Must not own |
| --- | --- | --- | --- |
| User and permission | `server.mjs`, `src/server/auth-http-service.mjs`, `src/server/route-access-policy.mjs`, `src/server/auth-service.mjs`, `src/server/auth-db.mjs` | Cookies, sessions, CSRF, RBAC, audit events, route access policy | Page rendering rules, planning logic, AI prompt logic |
| Student profile | `src/server/student-workspace-service.ts`, `src/repositories/*` | Typed profile contract, repository persistence, privacy guards | Static page routing, AI generation |
| Planning versions | `src/server/student-workspace-service.ts`, `src/repositories/*` | Drafts, snapshots, activity-import sources | Cookie/session handling |
| Resource recommendation | `src/domain/*recommender.mjs`, `src/domain/resource-eligibility.mjs` | Runtime Markdown data, pure scoring/parsing helpers | Auth, persistence, request routing |
| AI service | `src/server/deepseek-plan-service.mjs`, `src/server/deepseek-rag-service.mjs`, `src/server/retrieval-orchestrator.mjs`, `src/server/admissions-knowledge-graph-adapter.mjs`, `src/server/langchain-llm-client.mjs`, `src/server/langgraph-rag-workflow.mjs`, `src/server/langgraph-portfolio-capability-workflow.mjs`, `src/server/langgraph-school-selection-workflow.mjs`, `src/server/school-selection-service.mjs`, `src/server/portfolio-capability-agent-service.mjs`, `src/server/generation-job-service.mjs`, `src/server/ai-quality.mjs`, `src/server/deepseek-model.mjs`, `src/server/api-key.mjs`, `src/domain/retrieval-query-plan.mjs`, `src/domain/admissions-knowledge-graph.mjs`, `src/infrastructure/postgres-knowledge-graph.ts` | Server-only LangChain model calls, deterministic query planning, knowledge-graph traversal, hybrid RAG retrieval, model selection, API-key resolution, prompt/version metadata, validation, async generation job lifecycle | Browser imports of LangChain/LangGraph; raw chain-of-thought persistence or exposure; user/session mutation outside explicit save flows |
| Export service | `src/domain/word-export.mjs`, `src/domain/svg-export.mjs`, `src/server/account-data-rights-service.mjs`, account export in `src/server/auth-service.mjs` and `src/server/planning-service.mjs` | Serializable user-owned data, privacy lifecycle assembly, pure document generation | Auth routing, admin dashboard concerns |
| Admin operations | `server.mjs`, `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs`, `src/server/observability.mjs`, `src/server/admin-seed-service.mjs` | Admin RBAC, dashboard data, audit logs, ops metrics, seed scripts | Student-facing feature decisions |
| Data operations | `src/server/auth-db.mjs`, `src/server/sqlite-migrations.mjs`, `src/server/sqlite-maintenance.mjs`, `scripts/db.mjs` | SQLite schema, migrations, backup/restore, seed-admin CLI | Request routing, UI rendering |

## Route Inventory

| Route group | Routes | Boundary owner | Current service owner |
| --- | --- | --- | --- |
| Health and ops | `GET /healthz`, `GET /readyz`, `GET /api/admin/ops/metrics` | Fastify for health/readiness; native for admin ops | `src/server/fastify-http-layer.ts`, `src/server/admin-operations-service.mjs`, `src/server/observability.mjs`, `src/server/sqlite-migrations.mjs` |
| Auth | `/api/auth/me`, `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/request-password-reset`, `/api/auth/reset-password` | `server.mjs` | `src/server/auth-http-service.mjs`, `src/server/auth-service.mjs`, `src/server/mailer.mjs` |
| Account data rights | `GET /api/account/export`, `DELETE /api/account` | `server.mjs` | `src/server/account-data-rights-service.mjs`, `src/server/auth-service.mjs`, `src/server/planning-service.mjs`, portfolio/progress services |
| Feedback | `POST /api/feedback`, `PUT /api/admin/feedback/:id` | `server.mjs` | `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs` |
| Prompt and planning AI | `GET /api/prompt`, `POST /api/deepseek-plan`, `/api/deepseek-plan-jobs` | Fastify for prompt GET; native for planning and jobs | `src/server/fastify-http-layer.ts`, `src/server/deepseek-plan-service.mjs`, `src/server/generation-job-service.mjs`, `src/domain/agent-output-parser.mjs` |
| RAG Q&A | `POST /api/deepseek-rag`, `/api/deepseek-rag-jobs` | `server.mjs` | `src/server/deepseek-rag-service.mjs`, `src/server/retrieval-orchestrator.mjs`, `src/server/admissions-knowledge-graph-adapter.mjs`, `src/server/langgraph-rag-workflow.mjs`, `src/server/generation-job-service.mjs`, `src/server/ai-quality.mjs` |
| School selection | `POST /api/school-selection`, `/api/school-selection-jobs` | `server.mjs` | `src/server/school-selection-service.mjs`, `src/server/retrieval-orchestrator.mjs`, `src/server/admissions-knowledge-graph-adapter.mjs`, `src/server/generation-job-service.mjs` |
| Portfolio capability AI | `POST /api/portfolio-capability-assessment`, `/api/portfolio-capability-assessment-jobs` | `server.mjs` | `src/server/portfolio-capability-agent-service.mjs`, `src/server/generation-job-service.mjs` |
| Student profile | `GET/PUT /api/student-profile` | `server.mjs` | `src/server/planning-service.mjs` |
| Portfolio | `GET/PUT /api/my-activities`, `GET /api/my-activities/import-sources` | `server.mjs` | `src/server/activity-portfolio-service.mjs`, `src/server/planning-service.mjs` |
| Progress planner | `GET/PUT /api/progress-planner` | `server.mjs` | `src/server/progress-planner-service.mjs` |
| Planning projects | `/api/plans`, `/api/plans/:id`, `/api/plans/:id/snapshots`, `/api/plans/:id/snapshots/:snapshotId`, `/api/plans/:id/snapshots/:snapshotId/restore` | `server.mjs` | `src/server/planning-service.mjs` |
| Analytics | `POST /api/analytics/usage-event` | `server.mjs` | `src/server/student-workspace-service.ts`, analytics repository adapter |
| Admin dashboard and audit | `GET /api/admin/login-dashboard`, `GET /api/admin/audit-log/export` | `server.mjs` | `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs` |
| Static files | `GET/HEAD /*` | `server.mjs` | `src/server/static-file-service.mjs`, `src/server/route-access-policy.mjs` |

## Business Logic Still In server.mjs

The priority workspace route logic has been extracted. Remaining route groups should move only when a focused service boundary is clearer than the native HTTP coordination already present.

| Area | Current logic in `server.mjs` | Target service |
| --- | --- | --- |
| Remaining HTTP coordination | AI job and admin route response serialization | Keep route-owned until a typed handler removes meaningful duplication |

## Completed Extractions

| Date | Area | Service |
| --- | --- | --- |
| 2026-06-18 | DeepSeek plan generation: prompt loading, payload compaction, model parameters, retry loop, parser validation, quality metadata | `src/server/deepseek-plan-service.mjs` |
| 2026-06-18 | Generation job lifecycle: in-memory job store, TTL pruning, user isolation, async completion/failure state, response serialization | `src/server/generation-job-service.mjs` |
| 2026-06-18 | Route access policy: protected page list, protected data-file policy, user/admin access decisions, denied-audit event shape | `src/server/route-access-policy.mjs` |
| 2026-06-18 | Static file policy: content types, cache headers, safe file-path resolution, index auth-mode rendering, session-aware index rendering | `src/server/static-file-service.mjs` |
| 2026-06-18 | Account data rights: cross-service export assembly, export audit event, deletion confirmation extraction, account deletion delegation | `src/server/account-data-rights-service.mjs` |
| 2026-06-18 | Admin operations: dashboard filter parsing, success-audit event details, ops metrics backup status shape, feedback moderation audit, audit-log export policy | `src/server/admin-operations-service.mjs` |
| 2026-06-18 | Auth HTTP adapter: auth route response shape, redirect-vs-JSON behavior, session/CSRF cookie issuance, CSRF API guard | `src/server/auth-http-service.mjs` |
| 2026-07-12 | Student profile, activity portfolio, progress planner, planning versions, analytics, and destructive audit wiring | `src/server/student-workspace-service.ts`, `src/repositories/*` |
| 2026-08-03 | Query planning and GraphRAG orchestration for application Q&A, major matching, and school selection; deterministic Markdown graph ingestion and PostgreSQL recursive traversal | `src/domain/retrieval-query-plan.mjs`, `src/domain/admissions-knowledge-graph.mjs`, `src/server/retrieval-orchestrator.mjs`, `src/server/admissions-knowledge-graph-adapter.mjs`, `src/infrastructure/postgres-knowledge-graph.ts` |

## Extraction Rules

1. Preserve URLs, response shapes, cookie names, and cache-busting paths unless the change has a migration note.
2. Extract one vertical slice at a time, starting with the smallest route group that has focused tests.
3. Move logic only after a test proves the existing behavior.
4. Keep `server.mjs` responsible for HTTP primitives: request body reading, auth requirement calls, response serialization, and static file streaming.
5. Keep service modules independent of browser DOM and static HTML.
6. Keep domain modules pure and usable from tests without a server.
7. Do not introduce Express or a frontend bundler as part of boundary cleanup.

## Recommended Extraction Order

1. Add PostgreSQL adapters behind `src/repositories/contracts.ts` without changing route contracts.

## Boundary Test Expectations

The boundary is considered documented only if this file names:

- User and permission
- Student profile
- Planning versions
- Resource recommendation
- AI service
- Export service
- Admin operations
- Business logic still in `server.mjs`
- At least one explicit target service for extraction

See `tests/architecture-boundaries.test.mjs`.
