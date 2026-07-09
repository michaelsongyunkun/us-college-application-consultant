# LangGraph Persistence And Privacy Design

Created: 2026-07-02

## Decision

LangGraph persistence is intentionally disabled in the current implementation. The Ask DeepSeek graph runs per request or per existing generation job, returns the same response contract as before, and does not create LangGraph checkpoints, memory stores, or long-term graph state.

This keeps Phase 4 focused on workflow structure without adding a new private-data storage surface.

## Current Runtime Boundary

- `src/server/langgraph-rag-workflow.mjs` compiles an in-process `StateGraph`.
- The graph state is transient process memory only.
- Existing `/api/deepseek-rag-jobs` persistence remains the existing in-memory generation job lifecycle in `src/server/generation-job-service.mjs`.
- The graph does not persist retrieved context, raw prompts, raw essays, private notes, or model answers outside the existing route response/job result.
- User-triggered save actions remain explicit frontend actions, such as saving a DeepSeek answer as a note or action item.

## Future Storage Design

If LangGraph checkpoints are enabled later, they should use a dedicated SQLite-owned storage path rather than being mixed into planning drafts or portfolio records.

Required fields:

| Field | Purpose |
| --- | --- |
| `id` | Internal checkpoint id |
| `user_id` | Owning user; required for every row |
| `thread_id` | User-scoped graph thread id |
| `feature` | Example: `deepseek-rag` |
| `graph_version` | Example: `rag-answer-graph@2026-07-02` |
| `state_summary` | Minimal non-sensitive progress state |
| `state_refs` | References to existing user-owned records, not copied raw essays |
| `created_at` / `updated_at` | Retention and debugging |
| `expires_at` | Automatic cleanup boundary |

Do not store:

- Raw application essays or recommendation letters.
- Full retrieved Markdown chunks when source ids are enough.
- API keys, headers, cookies, CSRF tokens, or authorization values.
- Admin-only annotations in user graph state.

## Retention And Deletion

- Checkpoints must be user-owned.
- Account deletion must delete all checkpoints for the user in the same account data-rights flow.
- Account export may include checkpoint metadata only after a user-facing explanation exists.
- Default retention should be short-lived unless a user explicitly saves an output into an existing product record.

## Human Review Boundary

Graph outputs must not write back into portfolio notes, planning actions, school lists, or drafts automatically.

Allowed write path:

1. User receives an answer.
2. Quality metadata marks whether review is required.
3. User explicitly clicks a save/apply action.
4. Existing user-owned APIs perform the write with CSRF protection and owner checks.

Admin views should show operational counts and review flags, not raw private essays or sensitive graph state by default.

## Implementation Gate

Before enabling LangGraph persistence:

- [ ] Add storage schema and migration.
- [ ] Add account deletion cleanup tests.
- [ ] Add account export policy tests.
- [ ] Add admin redaction tests.
- [ ] Add retention cleanup behavior.
- [ ] Re-run `npm run verify` and `npm audit --json`.
