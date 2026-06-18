# Production Readiness Plan

Created: 2026-06-18

## Objective

Upgrade the US College Application Consultant from a demo-capable local app into a production-oriented product with reliable data operations, AI quality gates, security and privacy controls, observability, delivery discipline, clear module boundaries, and resilient user experience.

## Architecture Principles

- Keep the current native Node.js server and static browser ESM shape until a migration is explicitly justified.
- Move production responsibilities into small server/domain modules instead of growing `server.mjs`.
- Make every production capability testable through scripts, Node tests, or documented operator checks.
- Treat student profile, GPA, application drafts, school lists, and AI answers as sensitive data.
- Add PostgreSQL after SQLite has explicit migration, rollback, backup, restore, and seed discipline.

## Phase 1: Engineering And Data Foundation

### Task 1.1: CI And Environment Baseline

**Description:** Add stable command entry points and a GitHub Actions verification workflow.

**Acceptance criteria:**
- [x] `npm run verify` remains the full local verification command.
- [x] CI runs dependency install plus `npm run verify`.
- [x] `.env.example` documents runtime, database, AI, SMTP, and admin seed variables without secrets.

**Verification:**
- [ ] `npm run verify`

### Task 1.2: SQLite Migration Baseline

**Description:** Add a schema migration ledger and mark the current SQLite schema as the first baseline migration without dropping or rewriting existing local data.

**Acceptance criteria:**
- [x] New and existing SQLite databases get a `schema_migrations` table.
- [x] The current schema is recorded as `0001_auth_sqlite_baseline`.
- [x] Rollback exists but requires explicit confirmation in the CLI.

**Verification:**
- [ ] `node tests/sqlite-maintenance.test.mjs`
- [ ] `npm run db:status`

### Task 1.3: Backup, Restore, And Seed

**Description:** Provide operator-safe scripts for database backup, restore, and initial admin account creation.

**Acceptance criteria:**
- [x] `npm run db:backup` creates a consistent SQLite backup under `DATABASE_BACKUP_DIR`.
- [x] `npm run db:restore -- --backup <file> --yes` preserves the previous database before replacing it.
- [x] `npm run db:seed-admin` creates or updates an admin user from environment variables.

**Verification:**
- [ ] `node tests/sqlite-maintenance.test.mjs`

## Phase 2: Security And Privacy

### Task 2.1: Permission Matrix And RBAC Hardening

**Acceptance criteria:**
- [x] Document route-level roles for public, authenticated user, and admin access.
- [x] Add tests for forbidden cross-user reads/writes on all profile, plan, portfolio, progress, and admin APIs.
- [x] Replace ad hoc admin checks with a central route permission helper.

### Task 2.2: CSRF And Session Hardening

**Acceptance criteria:**
- [x] Mutating browser requests require a CSRF token or equivalent same-site defense.
- [x] Auth tests cover missing, invalid, and valid CSRF flows.
- [x] Password reset tokens are single-use, hashed, TTL-bound, and covered by replay tests.

### Task 2.3: User Data Rights

**Acceptance criteria:**
- [x] Users can export their profile, plans, portfolio, progress planner, and AI saved notes.
- [x] Users can request account/data deletion with irreversible confirmation.
- [x] Admin views redact sensitive fields by default.

### Task 2.4: Audit Logging

**Acceptance criteria:**
- [x] Store structured audit events for admin access, admin feedback updates, password reset completion, and destructive planning actions.
- [x] Redact token/password/secret-shaped audit details before persistence.
- [x] Add an admin audit-log view plus retention/export policy.

## Phase 3: Observability And Operations

### Task 3.1: Structured Logs And Request IDs

**Acceptance criteria:**
- [x] Every request has a request id in response headers and server logs.
- [x] Errors are logged as structured JSON without raw secrets or full student payloads.
- [x] Tests assert request id propagation on success and error paths.

### Task 3.2: Health, Metrics, And Alerts

**Acceptance criteria:**
- [x] `/healthz` reports process liveness.
- [x] `/readyz` reports database readiness and migration status.
- [x] Admin dashboard or logs expose AI failure rate, RAG retrieval time, API latency, and backup age.

## Phase 4: AI Quality Evaluation

### Task 4.1: Golden Test Set

**Acceptance criteria:**
- [x] Add curated fixtures for planning, RAG Q&A, school selection, and portfolio assessment.
- [x] `npm run eval:ai` runs deterministic offline checks without real API keys.
- [x] Evaluation output includes pass/fail thresholds and regression details.

### Task 4.2: Citation And Hallucination Guardrails

**Acceptance criteria:**
- [x] RAG answers include source ids/titles for user-visible claims.
- [x] Tests verify answers do not cite sources outside retrieved context.
- [x] Low-confidence or no-source answers trigger fallback copy and review flags.

### Task 4.3: Prompt Versioning

**Acceptance criteria:**
- [x] Each AI request records prompt version, model, source set version, and parser version.
- [x] Prompt changes have regression tests and a release note.

## Phase 5: Architecture Boundaries

### Task 5.1: Module Boundary Document

**Acceptance criteria:**
- [x] Document ownership for user/permission, student profile, planning versions, resource recommendation, AI service, export service, and admin operations.
- [x] Identify routes that still contain business logic inside `server.mjs`.

### Task 5.2: Service Extraction

**Acceptance criteria:**
- [x] Extract DeepSeek plan generation into `src/server/deepseek-plan-service.mjs`.
- [x] Extract shared async generation job lifecycle into `src/server/generation-job-service.mjs`.
- [x] Extract protected page/data and role access policy into `src/server/route-access-policy.mjs`.
- [x] Extract static file response policy into `src/server/static-file-service.mjs`.
- [x] Extract account export/delete orchestration into `src/server/account-data-rights-service.mjs`.
- [x] Extract admin dashboard, ops metrics, and feedback moderation orchestration into `src/server/admin-operations-service.mjs`.
- [x] Extract auth HTTP adapter, session/CSRF cookies, native-form redirects, and auth CSRF guard into `src/server/auth-http-service.mjs`.
- [ ] Move remaining route-heavy logic into tested service modules one vertical slice at a time.
- [ ] Keep `server.mjs` responsible for routing, request parsing, auth checks, and response serialization.

## Phase 6: Product-Grade Experience

### Task 6.1: State Coverage

**Acceptance criteria:**
- [ ] Key pages have loading, empty, error, permission failure, and retry states.
- [ ] Export failures preserve user work and offer a retry path.
- [ ] Mobile layouts pass smoke checks at 390px width.

### Task 6.2: Accessibility Baseline

**Acceptance criteria:**
- [ ] Forms have labels, validation messages, and keyboard reachable actions.
- [ ] Tabs, dialogs, and menus expose appropriate ARIA state.
- [ ] Focus order is tested for primary workflows.

## Phase 7: PostgreSQL Migration

### Task 7.1: Database Adapter Layer

**Acceptance criteria:**
- [ ] Data access is isolated behind service/repository functions.
- [ ] SQLite and PostgreSQL tests can run against the same contract fixtures.

### Task 7.2: PostgreSQL Migration And Rollback

**Acceptance criteria:**
- [ ] PostgreSQL migrations mirror SQLite schema constraints and indexes.
- [ ] Backup and restore runbook covers managed PostgreSQL.
- [ ] Cutover has rollback criteria and data validation queries.

## Current Checkpoint

Phases 1, 2, 3, 4, architecture-boundary documentation, and the first seven Phase 5 service extractions now have tested foundations. Phase 5 still has lower-priority student workspace route orchestration left in `server.mjs`, especially repeated authenticated CRUD response shapes and planning audit-event wiring. Do not start PostgreSQL migration until the remaining service-boundary extraction work is complete.
