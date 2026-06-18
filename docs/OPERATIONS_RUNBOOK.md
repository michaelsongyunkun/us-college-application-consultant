# Operations Runbook

Created: 2026-06-18

## Required Local Checks

Run before shipping code changes:

```powershell
npm run verify
```

Run before touching a persistent database:

```powershell
npm run db:status
npm run db:backup
```

## Environment Setup

1. Copy `.env.example` to `.env` in the deployment environment.
2. Set real values for `DEEPSEEK_API_KEY`, SMTP variables, and admin seed variables.
3. Keep `.env` and generated backups out of git.
4. Use `AUTH_DATABASE_PATH` for the active SQLite database.
5. Use `DATABASE_BACKUP_DIR` for operator-controlled backup output.

## Database Migration

Apply migrations:

```powershell
npm run db:migrate
```

Check migration status:

```powershell
npm run db:status
```

Rollback the last migration only after a backup has been created and the app is stopped:

```powershell
npm run db:rollback -- --yes
```

The first migration is a baseline for the current SQLite schema. Rolling it back removes application tables from the selected database, so only run rollback against the intended environment.

## Backup

Create a consistent SQLite backup:

```powershell
npm run db:backup
```

The command writes a timestamped `.sqlite` file under `DATABASE_BACKUP_DIR`, defaulting to `backups/sqlite`.

## Restore

Restore a backup only when the app process is stopped:

```powershell
npm run db:restore -- --backup backups/sqlite/auth-YYYY-MM-DDTHH-MM-SSZ.sqlite --yes
```

The restore command preserves the current database and any SQLite WAL/SHM files with a `.pre-restore-<timestamp>` suffix before copying the backup into place.

## Admin Seed

Set:

```powershell
$env:ADMIN_EMAIL="admin@example.com"
$env:ADMIN_NAME="Administrator"
$env:ADMIN_PASSWORD="replace-with-strong-password"
npm run db:seed-admin
```

The seed command creates or updates the account as `admin` and stores only the password hash.

## Audit Log Retention And Export

Default policy:

- Retain audit events for 365 days unless legal or customer requirements require a longer window.
- Export format is JSON from `GET /api/admin/audit-log/export`.
- Exports use the same masked audit-event payload shown in the admin security dashboard.
- Each successful export records `admin.audit_log.export` in the audit log.
- Automatic pruning is intentionally disabled until the production compliance retention window is confirmed.

Export the currently filtered audit log with an admin session cookie:

```powershell
curl -b cookies.txt "http://localhost:4177/api/admin/audit-log/export?fromDate=2026-06-01&toDate=2026-06-18" -o audit-log.json
```

Before any manual audit-log cleanup, create a database backup and preserve the exported JSON with the incident or release record.

## Release Checklist

- [ ] `git status --short` reviewed.
- [ ] `.env`, local SQLite files, logs, and exports are not staged.
- [ ] `npm run verify` passes.
- [ ] `/healthz` returns `status: ok`.
- [ ] `/readyz` returns `status: ready` and no pending or unknown migrations.
- [ ] `npm run db:status` shows only known migrations.
- [ ] `npm run db:backup` completed for any environment with real user data.
- [ ] Admin `/api/admin/ops/metrics` has no unexpected AI failure-rate, API-latency, RAG-latency, or backup alerts.
- [ ] Audit-log export works for the release window if security-relevant behavior changed.
- [ ] Release notes mention schema, AI, security, and user-facing changes.
- [ ] Rollback path is documented for the specific release.

## Observability

Every response includes `X-Request-Id`. If the request supplies `X-Request-Id`, the server reuses it after validation; otherwise it generates one.

When the app is started through `npm start` or `node server.mjs`, request logs are emitted as one JSON object per request with:

- `event`
- `requestId`
- `method`
- `path`
- `statusCode`
- `durationMs`

Handled 4xx responses are logged at `warn`; 5xx responses are logged at `error`. Logs intentionally avoid request bodies, cookies, tokens, passwords, and API keys.

Health and readiness:

```powershell
curl http://localhost:4177/healthz
curl http://localhost:4177/readyz
```

Admin metrics:

```powershell
curl -b cookies.txt http://localhost:4177/api/admin/ops/metrics
```

The metrics response includes HTTP latency/status counters, DeepSeek call failure rate, RAG retrieval timing, latest backup age, and alert flags.

## Incident Checklist

- [ ] Capture request id, timestamp, route, user impact, and deployment version.
- [ ] Check application logs for structured errors.
- [ ] Check database readiness and migration status.
- [ ] Check DeepSeek API failures and RAG latency if AI paths are affected.
- [ ] Restore from the most recent verified backup only after preserving the current database.
