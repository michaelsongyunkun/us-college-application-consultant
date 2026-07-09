# Architecture Boundaries

Created: 2026-06-18

## Decision Summary

Keep `server.mjs` as the native Node.js HTTP boundary for routing, request parsing, response serialization, security headers, cookies, rate limits, CSRF checks, request ids, and static file serving. Product behavior should live in `src/server/` service modules or `src/domain/` pure modules, with tests at the same ownership level.

The guiding rule is: routes coordinate; services decide; domain modules calculate.

## Ownership Matrix

| Capability | Current owner | Allowed dependencies | Must not own |
| --- | --- | --- | --- |
| User and permission | `server.mjs`, `src/server/auth-http-service.mjs`, `src/server/route-access-policy.mjs`, `src/server/auth-service.mjs`, `src/server/auth-db.mjs` | Cookies, sessions, CSRF, RBAC, audit events, route access policy | Page rendering rules, planning logic, AI prompt logic |
| Student profile | `src/server/planning-service.mjs` | SQLite profile persistence, privacy guards | Static page routing, AI generation |
| Planning versions | `src/server/planning-service.mjs` | Drafts, snapshots, activity-import sources | HTTP status selection, cookie/session handling |
| Resource recommendation | `src/domain/*recommender.mjs`, `src/domain/resource-eligibility.mjs` | Runtime Markdown data, pure scoring/parsing helpers | Auth, persistence, request routing |
| AI service | `src/server/deepseek-plan-service.mjs`, `src/server/deepseek-rag-service.mjs`, `src/server/langchain-llm-client.mjs`, `src/server/langgraph-rag-workflow.mjs`, `src/server/langgraph-portfolio-capability-workflow.mjs`, `src/server/langgraph-school-selection-workflow.mjs`, `src/server/school-selection-service.mjs`, `src/server/portfolio-capability-agent-service.mjs`, `src/server/generation-job-service.mjs`, `src/server/ai-quality.mjs`, `src/server/deepseek-model.mjs`, `src/server/api-key.mjs` | Server-only LangChain model calls, model selection, API-key resolution, prompt/version metadata, RAG retrieval, graph orchestration, validation, async generation job lifecycle | Browser imports of LangChain/LangGraph; user/session mutation outside explicit save flows |
| Export service | `src/domain/word-export.mjs`, `src/domain/svg-export.mjs`, `src/server/account-data-rights-service.mjs`, account export in `src/server/auth-service.mjs` and `src/server/planning-service.mjs` | Serializable user-owned data, privacy lifecycle assembly, pure document generation | Auth routing, admin dashboard concerns |
| Admin operations | `server.mjs`, `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs`, `src/server/observability.mjs`, `src/server/admin-seed-service.mjs` | Admin RBAC, dashboard data, audit logs, ops metrics, seed scripts | Student-facing feature decisions |
| Data operations | `src/server/auth-db.mjs`, `src/server/sqlite-migrations.mjs`, `src/server/sqlite-maintenance.mjs`, `scripts/db.mjs` | SQLite schema, migrations, backup/restore, seed-admin CLI | Request routing, UI rendering |

## Route Inventory

| Route group | Routes | Boundary owner | Current service owner |
| --- | --- | --- | --- |
| Health and ops | `GET /healthz`, `GET /readyz`, `GET /api/admin/ops/metrics` | `server.mjs` | `src/server/admin-operations-service.mjs`, `src/server/observability.mjs`, `src/server/sqlite-migrations.mjs` |
| Auth | `/api/auth/me`, `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/request-password-reset`, `/api/auth/reset-password` | `server.mjs` | `src/server/auth-http-service.mjs`, `src/server/auth-service.mjs`, `src/server/mailer.mjs` |
| Account data rights | `GET /api/account/export`, `DELETE /api/account` | `server.mjs` | `src/server/account-data-rights-service.mjs`, `src/server/auth-service.mjs`, `src/server/planning-service.mjs`, portfolio/progress services |
| Feedback | `POST /api/feedback`, `PUT /api/admin/feedback/:id` | `server.mjs` | `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs` |
| Prompt and planning AI | `GET /api/prompt`, `POST /api/deepseek-plan`, `/api/deepseek-plan-jobs` | `server.mjs` | `src/server/deepseek-plan-service.mjs`, `src/server/generation-job-service.mjs`, `src/domain/agent-output-parser.mjs`; `GET /api/prompt` stays route-owned |
| RAG Q&A | `POST /api/deepseek-rag`, `/api/deepseek-rag-jobs` | `server.mjs` | `src/server/deepseek-rag-service.mjs`, `src/server/langgraph-rag-workflow.mjs`, `src/server/generation-job-service.mjs`, `src/server/ai-quality.mjs` |
| School selection | `POST /api/school-selection`, `/api/school-selection-jobs` | `server.mjs` | `src/server/school-selection-service.mjs`, `src/server/generation-job-service.mjs` |
| Portfolio capability AI | `POST /api/portfolio-capability-assessment`, `/api/portfolio-capability-assessment-jobs` | `server.mjs` | `src/server/portfolio-capability-agent-service.mjs`, `src/server/generation-job-service.mjs` |
| Student profile | `GET/PUT /api/student-profile` | `server.mjs` | `src/server/planning-service.mjs` |
| Portfolio | `GET/PUT /api/my-activities`, `GET /api/my-activities/import-sources` | `server.mjs` | `src/server/activity-portfolio-service.mjs`, `src/server/planning-service.mjs` |
| Progress planner | `GET/PUT /api/progress-planner` | `server.mjs` | `src/server/progress-planner-service.mjs` |
| Planning projects | `/api/plans`, `/api/plans/:id`, `/api/plans/:id/snapshots`, `/api/plans/:id/snapshots/:snapshotId`, `/api/plans/:id/snapshots/:snapshotId/restore` | `server.mjs` | `src/server/planning-service.mjs` |
| Analytics | `POST /api/analytics/usage-event` | `server.mjs` | `src/server/auth-service.mjs` |
| Admin dashboard and audit | `GET /api/admin/login-dashboard`, `GET /api/admin/audit-log/export` | `server.mjs` | `src/server/admin-operations-service.mjs`, `src/server/auth-service.mjs` |
| Static files | `GET/HEAD /*` | `server.mjs` | `src/server/static-file-service.mjs`, `src/server/route-access-policy.mjs` |

## Business Logic Still In server.mjs

These are the next extraction candidates. Each extraction should move behavior and tests together, without changing browser routes.

| Area | Current logic in `server.mjs` | Target service |
| --- | --- | --- |
| Student workspace route orchestration | Repeated authenticated CRUD response shapes and destructive planning audit event wiring | `src/server/student-workspace-service.mjs` |

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

## Extraction Rules

1. Preserve URLs, response shapes, cookie names, and cache-busting paths unless the change has a migration note.
2. Extract one vertical slice at a time, starting with the smallest route group that has focused tests.
3. Move logic only after a test proves the existing behavior.
4. Keep `server.mjs` responsible for HTTP primitives: request body reading, auth requirement calls, response serialization, and static file streaming.
5. Keep service modules independent of browser DOM and static HTML.
6. Keep domain modules pure and usable from tests without a server.
7. Do not introduce Express or a frontend bundler as part of boundary cleanup.

## Recommended Extraction Order

1. `student-workspace-service.mjs`: groups authenticated student CRUD route orchestration and planning audit-event wiring.

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
