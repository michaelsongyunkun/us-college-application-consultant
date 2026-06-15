# Project: US College Application Consultant

## Purpose

This project is a local and deployable US college application planning tool. It combines static HTML pages, browser ESM modules, a native Node.js HTTP server, SQLite-backed auth/planning storage, curated Markdown data libraries, and DeepSeek-powered planning/RAG features.

## Stack

- Runtime: Node.js 20+ with ESM (`"type": "module"`).
- Server: native `node:http` in `server.mjs`; no Express framework.
- Database: `better-sqlite3` via `src/server/auth-db.mjs`.
- Frontend: static `*.html`, `styles.css`, and browser modules under `src/client/`.
- Domain logic: plain ESM modules under `src/domain/`, shared by tests and browser/server where appropriate.
- Server-only modules: `src/server/`.
- Shared utilities: `src/shared/`.
- Tests: plain Node scripts in `tests/*.test.mjs`, run by `scripts/run-tests.mjs`.

## Commands

- Start local service with default server port:
  `npm start`
- Start preferred Windows local workflow:
  `start-consultant.cmd`
- Syntax check:
  `npm run check`
- Test suite:
  `npm test`
- Full verification:
  `npm run verify`

`start-consultant.cmd` sets `PORT=4179` before running `node server.mjs`. A bare `npm start` uses the server default port `4177` unless `PORT` is set.

## Required Workflow For Codex

Before editing:

1. Run `git status --short` and preserve user changes.
2. Read this file and `docs/CODEX_PROJECT_MAP.md`.
3. Read the exact files likely to be edited.
4. Read at least one related test or local implementation pattern.
5. Do not read `.env` or local database files unless the user explicitly asks and the task requires it.

Before finishing:

1. Run `npm run verify` when code or behavior changed.
2. For frontend layout or interaction changes, also perform a browser smoke check on the affected page at desktop and mobile widths.
3. Report any verification that could not be run and why.

## Anti-Hang Rules

- Prefer commands that exit on their own: targeted tests, `npm run check`, and `npm run verify`.
- Do not run `node server.mjs`, `npm start`, or other long-lived local servers directly inside a synchronous shell command.
- For page smoke checks, first use existing page/server tests and static structure checks. Start a browser only when visual layout or interaction truly requires it.
- If a local server is unavoidable, split the work into separate start, ready-check, verification, and cleanup steps with explicit timeouts and pid cleanup.
- After any interrupted or timed-out server attempt, check the specific port and pid before continuing. Never bulk-kill all `node` processes.

## Boundaries

- Do not commit or expose `.env`, `.env.*`, API keys, SMTP credentials, logs, exported `.doc/.docx`, or local JSON exports.
- Do not delete or rewrite `data/*.md`; these Markdown files are runtime business data.
- Do not modify `prompts/us-college-admissions-strategist-agent.md` unless the user explicitly asks. It is a fixed product prompt.
- Do not delete `data/auth.sqlite` unless the user explicitly confirms they want to reset local accounts and drafts.
- Do not move HTML, client modules, or domain modules without checking browser `<script>` paths, ESM import paths, and tests.
- Do not replace the native Node server with a framework unless the user explicitly asks for that migration.
- Do not make broad visual redesigns when asked for a narrow fix.

## Common Change Patterns

- Page UI change:
  read the relevant `*.html`, `styles.css`, its `src/client/*.js` module, and matching layout/page tests.
- Domain logic change:
  edit `src/domain/*.mjs` and add or update the corresponding `tests/*.test.mjs`.
- Server API change:
  edit `server.mjs` plus the relevant `src/server/*.mjs` service and server tests.
- Auth or user data change:
  read `src/server/auth-service.mjs`, `src/server/auth-db.mjs`, privacy guards, and auth/server tests.
- RAG or DeepSeek change:
  read the relevant service, model/api-key helpers, data file shape, and tests; never hardcode API keys.
- Export change:
  read `src/domain/word-export.mjs`, `src/domain/svg-export.mjs`, related client call sites, and export tests.

## Verification Matrix

| Change type | Minimum verification |
| --- | --- |
| Docs only | Check file exists and Markdown structure is valid |
| JS/MJS source | `npm run check` and targeted test if available |
| Domain/server behavior | `npm run verify` |
| Frontend page/layout | `npm run verify` plus Browser/Playwright smoke check |
| Auth, privacy, API key, SMTP | `npm run verify` plus focused security/privacy review |
| Data library parsing | Relevant parser/recommender tests and no unintended data deletion |

## Style And Implementation Notes

- Prefer small, focused changes.
- Preserve existing plain ESM style and named exports.
- Keep domain logic testable outside the browser.
- Use existing helper functions such as `escapeHtml`, `getRequestErrorMessage`, privacy guards, and domain parsers instead of duplicating logic.
- Keep cache-busting query strings in HTML imports when changing browser modules in production-sensitive pages.
- Use structured parsers for Markdown data where existing modules already provide them.

## Current Known State

- `npm run verify` already exists and runs syntax checks plus all `tests/*.test.mjs`.
- The working tree may contain user changes. At the time this file was created, `assets/logo-horizontal.svg` was already deleted in git status; do not restore or remove it unless the user asks.
