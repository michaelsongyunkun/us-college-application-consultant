# Production data, retrieval, job and file migration

## Safety model

The first cutover is a maintenance-window migration, not dual-write:

1. Pause writes with `work/maintenance/write-paused.lock`.
2. Back up SQLite with the existing online backup helper.
3. Apply Drizzle migrations to PostgreSQL.
4. Import all SQLite account/workspace/event tables in foreign-key order.
5. Compare row counts, SQLite foreign-key checks and SHA-256 hashes of critical fields.
6. Only after a green report, set `DATABASE_URL` for the app and Worker and restart the same image version.
7. Verify `/readyz`, authentication, ownership checks, a read-only dashboard query and one queued job.
8. Remove the write pause with `npm run db:cutover -- resume --yes`.

If any import or validation step fails, the PostgreSQL transaction rolls back and the script removes the write pause. SQLite remains authoritative.

## Commands

```powershell
# 1. Non-writing inventory and validation plan
npm run db:import:postgres

# 2. Maintenance-window import. --replace is allowed only for a disposable/approved target.
npm run db:cutover -- cutover --yes --replace

# 3. After DATABASE_URL is switched and app/Worker checks pass
npm run db:cutover -- resume --yes

# 4. Rollback drill or real rollback: unset DATABASE_URL/redeploy SQLite, then resume writes
npm run db:cutover -- rollback --yes
```

Reports are written to `work/migration-reports/` and contain source/target row counts, hashes, foreign-key results, backup metadata and rollback instructions. They must not be committed because they can expose operational metadata.

## Imported tables

- `users`, `sessions`, `password_reset_tokens`
- `login_events`, `usage_events`, `audit_events`, `feedback_entries`
- `student_profiles`, `student_activity_portfolios`, `student_progress_planners`
- `planning_projects`, `planning_snapshots`

Explicit integer IDs are preserved and PostgreSQL sequences are advanced after import. JSON text is parsed into `jsonb`; timestamp values remain ISO-compatible. The importer refuses a non-empty target unless `--replace` is explicitly supplied.

## Markdown ingestion and retrieval

`data/*.md` is never deleted or rewritten. `npm run knowledge:ingest` reads it, chunks deterministically, records source ID/content hash/source version/update time/confidence/official URL/embedding model version, and upserts PostgreSQL. Re-running unchanged sources produces no new embeddings.

Choose one retrieval path before ingestion:

- Vector Hybrid: set `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS=1536`.
- DeepSeek-only reranking: leave the embedding variables unset, run `npm run knowledge:ingest -- --keyword-only`, and set `DEEPSEEK_RERANK_ENABLED=true`, `DEEPSEEK_RERANK_MODEL=deepseek-v4-flash`, `DEEPSEEK_RERANK_TIMEOUT_MS=15000`, `DEEPSEEK_RERANK_MAX_TOKENS=1800`, and `DEEPSEEK_RERANK_CANDIDATE_LIMIT=12`. This reuses `DEEPSEEK_API_KEY`; no separate embedding key is required.

If vector search is unavailable, online retrieval automatically uses PostgreSQL keyword search plus the existing local keyword context. With DeepSeek reranking enabled, the expected infrastructure mode is `keyword-fallback-reranked`; this is not vector Hybrid. An explicitly configured `RERANKER_URL` still takes precedence over DeepSeek. `npm run eval:retrieval` must remain green before release.

## Job operations

The app enqueues and the Worker processes the same queue from the same image version. The queue covers DeepSeek plan/RAG/school/capability work, Word exports and password-reset email.

- `Idempotency-Key` is accepted on job creation. The Redis job ID is deterministic per user, job type and key.
- Job reads/cancels verify `userId` ownership.
- Retries use capped attempts and exponential backoff; final failures are copied to `<queue>-dead-letter`.
- Redis uses AOF in compose. The Testcontainers suite restarts Redis and verifies completed job recovery and duplicate suppression.
- Active cancellation sets a durable cancellation token; pending work is removed and represented by a cancellation tombstone.

## Object storage

- Development: `OBJECT_STORE_DRIVER=local` or `minio`.
- Production: `s3` or `r2` with private buckets.
- Every key is generated as `users/<numericUserId>/<relativeKey>`; traversal and cross-user reads are rejected.
- Signed URLs are capped at one hour; the default is five minutes.
- Configure a seven-day (or product-approved shorter) lifecycle rule for exports. MinIO compose creates this rule automatically.

## CI and local limitations

`npm run test:infra` uses Testcontainers to start pgvector/PostgreSQL, Redis and MinIO. It runs the same PostgreSQL repository contract, an actual SQLite import and hash validation, PostgreSQL auth/session checks, Redis restart/idempotency checks and S3-compatible isolation/download checks.

This command requires a Docker-compatible runtime. The ordinary `npm run verify` remains Docker-free so contributors can run fast unit and contract checks; CI runs both gates.
