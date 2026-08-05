# Render Deployment

This project deploys to Render from the repository-root `render.yaml` Blueprint.

## Production topology

- Docker web service (`npm start`) with `/readyz` health checks.
- Dedicated Docker worker (`node --import tsx worker.mjs`) consuming BullMQ jobs.
- Render Key Value (Redis) with journal-snapshot persistence and `noeviction` so queue state and cancellation markers are not silently evicted under memory pressure.
- Render Postgres with migrations and keyword/GraphRAG knowledge ingestion before each web deploy.
- In-process generation jobs remain available only as the local no-Redis fallback.
- External S3-compatible object storage (the Blueprint defaults to Cloudflare R2) so exports survive web deploys and restarts.
- Singapore region for every Render-managed component.

The Blueprint uses a `starter` web service and `basic-256mb` Postgres. At the time this configuration was created, Render estimated approximately $14.95/month in Singapore; confirm the current price in the Dashboard before applying it. R2/S3 charges are separate. Do not substitute Free Postgres for production data: Render Free Postgres expires after 30 days and has no backups.

This topology preserves model selection, Query Planning, GraphRAG, structured reasoning, account data, and knowledge ingestion. The Blueprint now provisions the worker and Key Value service by default, so queued and running jobs survive web deploys and can be resumed by the worker. If `REDIS_URL` is intentionally removed for local development, the application still falls back to in-process jobs; those jobs are not durable across a process restart.

The worker and Key Value service are additional paid Render resources. Confirm the current regional price in the Dashboard before applying the Blueprint.

## Prerequisites

1. Connect the private GitHub repository to Render.
2. Create an R2 bucket (or an S3-compatible bucket) and configure a lifecycle rule for temporary exports.
3. Have the DeepSeek API key and the Volcengine Ark inspiration API key available.
4. Decide whether password-reset email is enabled. If it is, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to the `consultant-production` environment group after creation.

## Create the Blueprint

1. Open **Render Dashboard → New → Blueprint**.
2. Select `michaelsongyunkun/us-college-application-consultant` and branch `main`.
3. Render detects `/render.yaml`.
4. Enter the prompted values without committing them to Git:

   - `DEEPSEEK_API_KEY`
   - `INSPIRATION_API_KEY`
   - `OBJECT_STORE_ENDPOINT` (R2 example: `https://<account-id>.r2.cloudflarestorage.com`)
   - `OBJECT_STORE_BUCKET`
   - `OBJECT_STORE_ACCESS_KEY_ID`
   - `OBJECT_STORE_SECRET_ACCESS_KEY`

5. Review the monthly price and apply the Blueprint.

Render automatically provides `RENDER_EXTERNAL_URL`; the server uses it as the password-reset base URL unless `APP_BASE_URL` is explicitly set. Set `APP_BASE_URL` later when attaching a custom domain.

## First-deploy verification

Replace `<service-url>` with the generated `onrender.com` URL:

```powershell
Invoke-RestMethod https://<service-url>/healthz
Invoke-RestMethod https://<service-url>/readyz
```

Both endpoints must return HTTP 200. Then verify registration/login, one planning request, Ask DeepSeek RAG, school selection, inspiration streaming, and a Word export. Confirm that the worker consumes the job and the signed export URL downloads from the configured bucket. For a durability check, enqueue a long-running job, restart or redeploy the web service, and confirm the same job ID transitions to `completed` or `failed` instead of disappearing.

## Admin and email setup

The existing `npm run db:seed-admin` command targets SQLite and must not be used against the Render Postgres database. Register the initial account normally, then promote it using an audited PostgreSQL administration procedure before exposing the admin dashboard. Configure SMTP in the shared Render environment group before relying on password-reset email.

## Deploy and rollback

- `autoDeployTrigger: checksPass` deploys `main` only after GitHub checks pass.
- The web pre-deploy command runs PostgreSQL migrations and idempotent keyword-only knowledge/graph ingestion.
- Roll back the web service to the previous image revision from Render's deploy history.
- Never roll back the database schema destructively during an incident. Restore or roll forward using the production data runbook.
