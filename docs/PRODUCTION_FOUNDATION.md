# Production Foundation

The browser remains native ESM. SQLite is the zero-configuration fallback; setting `DATABASE_URL` switches the application to the PostgreSQL runtime after Drizzle migrations complete.

## Contracts

- Runtime/type source: `src/contracts/schemas.ts` (Zod + inferred TypeScript types).
- Generated API document: `docs/openapi.json`.
- Drift gate: `npm run openapi:check`.
- Browser/server compatibility gate: `npm run contracts:compat`.
- Unified API errors retain the legacy `error` string and add `code`, `requestId`, and `retryable`.

## Persistence boundary

`src/repositories/contracts.ts` defines the browser-facing workspace boundary. `production-contracts.ts` covers users, sessions, profiles, activities, progress, plans, snapshots, Analytics, audit and transactions. SQLite and PostgreSQL adapters run against the same contract suite.

The PostgreSQL schema is in `src/db/schema/postgres.ts`; Drizzle migrations are under `drizzle/`. PostgreSQL uses a bounded `pg` pool and async transactions. See `docs/PRODUCTION_DATA_MIGRATION.md` for dry-run, cutover and rollback procedures.

## AI runtime

- Prompt content is immutable; `prompts/manifest.json` pins its SHA-256, model set, schema, enabled state, and environment selection.
- Planning output requests strict JSON and validates `PlanningResult`; legacy Markdown is accepted only as a compatibility fallback and is marked for manual review.
- `ai-call-policy.ts` owns timeout, capped exponential backoff, retry classification, circuit breaking, and fallback models.
- Reranking prefers an explicitly configured external `RERANKER_URL`. Otherwise, `DEEPSEEK_RERANK_ENABLED=true` reuses the server-side `DEEPSEEK_API_KEY`, requests strict JSON scores, and validates candidate indices before applying the ranking.

## Observability and privacy

- Pino emits structured JSON logs with redaction.
- OpenTelemetry creates HTTP, LangChain, LangGraph/RAG, and repository/database spans. Configure `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` to export.
- Sentry is opt-in through `SENTRY_DSN`, disables default integrations, and receives only sanitized exception names plus an allow-list of operational metadata. Student text, prompts, retrieved context, messages, cookies, authorization, and keys are excluded.

## Containers

`docker compose up --build` starts PostgreSQL/pgvector, Redis with AOF, MinIO, the application and a same-image Worker. Named volumes persist the SQLite rollback source, PostgreSQL, Redis, object data and backups.

## Jobs, retrieval and files

- BullMQ uses user-scoped deterministic job IDs for idempotency, retained terminal states, timeout/retry/backoff, cancellation tombstones and a dead-letter queue. With no `REDIS_URL`, local development keeps the existing in-memory fallback.
- Markdown remains the canonical business source. `npm run knowledge:ingest` performs content-hash based upserts; unchanged chunks are not re-embedded. `--keyword-only` is available when an embedding service is intentionally unavailable.
- With an embedding provider configured, PostgreSQL retrieval combines pgvector and `tsvector`; vector failures return the keyword path. Without an embedding provider, ingest with `npm run knowledge:ingest -- --keyword-only` and optionally enable DeepSeek reranking. That mode is reported as `keyword-fallback-reranked`, not vector Hybrid. `npm run eval:retrieval` prevents retrieval MRR/recall from dropping below the keyword baseline.
- Object keys are always `users/<userId>/...`. Local storage and S3-compatible MinIO/S3/R2 implement the same interface; downloads use expiring signatures. MinIO compose config expires objects after seven days, while production S3/R2 must use an equivalent bucket lifecycle rule.
- A transitional production deployment that still uses the local object-store driver must set a unique `OBJECT_STORE_SIGNING_SECRET`; the application refuses to start with the public development default in production.

Official implementation references:

- [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql) and [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [BullMQ job IDs](https://docs.bullmq.io/guide/jobs/job-ids) and [failed-job retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [pgvector](https://github.com/pgvector/pgvector)
- [Amazon S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Testcontainers for Node.js](https://node.testcontainers.org/)
