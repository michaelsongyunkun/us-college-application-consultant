# Security And Privacy Matrix

Created: 2026-06-18

## Data Classification

| Data | Classification | Examples | Default handling |
| --- | --- | --- | --- |
| Public site content | Public | landing page, contact, disclaimer, favicon, robots | Public GET only |
| Runtime resource library | Authenticated product data | Markdown datasets under `data/` | Require login because resources feed personalized planning |
| Student profile | Sensitive student data | grade, interests, school context, target major | User-owned, never cross-user |
| Planning drafts and snapshots | Sensitive student data | AI-generated plans, activities, backups | User-owned, snapshot restore/delete scoped by owner |
| Portfolio and academics | Highly sensitive student data | GPA, SAT/AP, activities, recommendation letters, school list | User-owned, minimize admin exposure |
| AI prompts and answers | Sensitive derived data | DeepSeek plan, RAG answers, saved AI notes | User-owned, source/citation tracking required in Phase 4 |
| LangGraph transient graph state | Sensitive derived runtime data | RAG workflow node state, portfolio capability workflow state, school selection workflow state, retrieved context, draft answer before response serialization | Process memory only; no checkpoint/store persistence enabled |
| LangGraph operational counters | Admin operational data | Workflow run counts, node failure counts, review-required rates, aggregate latencies | Admin metrics only; no raw prompts, retrieved context, essays, notes, answers, or API keys |
| Operational analytics | Admin operational data | login events, usage events, feedback | Admin only, redact where practical |
| Security audit events | Admin security data | admin access, feedback moderation, password reset completion, destructive plan actions | Admin only, structured metadata, no raw secrets or full student payloads, JSON export uses masked fields |
| Secrets | Secret | API keys, SMTP password, session tokens, reset tokens | Environment only, hash stored tokens |

## Route Permission Matrix

| Route | Methods | Access | CSRF required for mutation | Notes |
| --- | --- | --- | --- | --- |
| `/`, `/index.html` | GET, HEAD | Public shell, personalized when logged in | No | Varies by cookie |
| `/contact.html`, `/disclaimer.html`, `/feedback.html`, `/robots.txt`, `/sitemap.xml`, `/favicon.svg`, `/favicon.ico` | GET, HEAD | Public | No | Static content |
| `/styles.css`, `/src/client/*`, `/assets/*` | GET, HEAD | Public | No | Static assets |
| `/data/*` | GET, HEAD | Authenticated user | No | Runtime product data |
| protected app pages | GET, HEAD | Authenticated user | No | Course, GPA, portfolio, planning tracker, school/RAG/resource pages |
| `/admin.html` | GET, HEAD | Admin | No | Redirects non-admin |
| `/api/auth/register` | POST | Public | No | Creates session and CSRF token |
| `/api/auth/login` | POST | Public | No | Creates session and CSRF token |
| `/api/auth/logout` | POST | Authenticated user | Yes | Clears session and CSRF cookies |
| `/api/auth/me` | GET | Authenticated user | No | Ensures CSRF cookie for current session |
| `/api/account/export` | GET | Authenticated user | No | Self-service JSON export of account, profile, plans/snapshots, portfolio, progress planner, and saved AI notes |
| `/api/account` | DELETE | Authenticated user | Yes | Requires exact email confirmation, deletes account data and clears cookies |
| `/api/auth/request-password-reset` | POST | Public | No | Safe response regardless of account existence |
| `/api/auth/reset-password` | POST | Public reset token | No | Token is hashed and single-use |
| `/api/feedback` | POST | Public or authenticated | No | Accepts public feedback, validates fields |
| `/api/prompt` | GET | Authenticated user | No | No prompt write |
| `/api/deepseek-plan`, `/api/deepseek-plan-jobs` | POST | Authenticated user | Yes | AI generation from student profile |
| `/api/deepseek-plan-jobs/:id` | GET | Owning user | No | Job owner check |
| `/api/deepseek-rag`, `/api/deepseek-rag-jobs` | POST | Authenticated user | Yes | AI/RAG generation |
| `/api/deepseek-rag-jobs/:id` | GET | Owning user | No | Job owner check |
| `/api/school-selection`, `/api/school-selection-jobs` | POST | Authenticated user | Yes | AI school selection |
| `/api/school-selection-jobs/:id` | GET | Owning user | No | Job owner check |
| `/api/portfolio-capability-assessment`, `/api/portfolio-capability-assessment-jobs` | POST | Authenticated user | Yes | AI portfolio assessment |
| `/api/portfolio-capability-assessment-jobs/:id` | GET | Owning user | No | Job owner check |
| `/api/student-profile` | GET | Owning user | No | User-owned read |
| `/api/student-profile` | PUT | Owning user | Yes | Sensitive profile write |
| `/api/my-activities` | GET | Owning user | No | User-owned read |
| `/api/my-activities` | PUT | Owning user | Yes | Portfolio and academic record write |
| `/api/my-activities/import-sources` | GET | Owning user | No | User-owned import source read |
| `/api/progress-planner` | GET | Owning user | No | User-owned read |
| `/api/progress-planner` | PUT | Owning user | Yes | Planning task write |
| `/api/plans` | GET | Owning user | No | User-owned plan list |
| `/api/plans` | POST | Owning user | Yes | Plan create |
| `/api/plans/:id` | GET | Owning user | No | User-owned plan read |
| `/api/plans/:id` | PUT | Owning user | Yes | Plan update |
| `/api/plans/:id` | DELETE | Owning user | Yes | Plan delete, last plan guarded |
| `/api/plans/:id/snapshots` | GET | Owning user | No | User-owned snapshot list |
| `/api/plans/:id/snapshots` | POST | Owning user | Yes | Snapshot create |
| `/api/plans/:id/snapshots/:snapshotId/restore` | POST | Owning user | Yes | Snapshot restore |
| `/api/plans/:id/snapshots/:snapshotId` | DELETE | Owning user | Yes | Snapshot delete |
| `/api/analytics/usage-event` | POST | Authenticated user | Yes | Operational event write |
| `/api/admin/login-dashboard` | GET | Admin | No | Admin operational dashboard, includes structured audit events |
| `/api/admin/audit-log/export` | GET | Admin | No | Filtered JSON audit export with retention policy metadata |
| `/api/admin/feedback/:id` | PUT | Admin | Yes | Admin feedback update |

## Immediate Security Controls

- Passwords use scrypt hashes.
- Session and password reset tokens are hashed in SQLite.
- Password reset regression tests verify raw reset tokens are not stored, used tokens cannot be replayed, expired tokens cannot reset passwords, and successful resets clear existing sessions.
- Session cookie is `HttpOnly` and `SameSite=Lax`; `Secure` is enabled in production unless overridden.
- Auth and AI endpoints have rate limits.
- LangChain and LangGraph packages stay server-only; browser modules continue to call existing first-party API routes.
- Mutating authenticated API calls require CSRF protection.
- Route authorization goes through a central permission helper for user/admin checks.
- Cross-user authorization regression tests cover profile, plans, snapshots, portfolio, progress planner, and admin APIs.
- Structured audit events are stored for admin access, moderation updates, password reset completion, and destructive planning actions.
- Admins can view audit events in the security dashboard and export filtered JSON audit logs with a documented 365-day retention policy.
- Self-service account export and account deletion are available through authenticated APIs.
- Admin dashboard payloads mask direct identifiers such as email, contact, and IP fields by default.
- LangGraph RAG workflow state is transient and is not persisted to checkpoints or long-term memory stores.
- LangGraph operational metrics record aggregate workflow/node counters only and intentionally exclude raw graph state.
- Graph outputs require explicit user save/apply actions before becoming portfolio notes, planning actions, or other user-owned records.
- SQL uses parameterized `better-sqlite3` statements.
- Static and API responses include basic security headers.

## Remaining Security Work

- Automate audit-log pruning after the required external compliance retention window is confirmed.
- Add user-facing settings UI for export/delete APIs.
- Expand redaction controls with an explicit audited reveal workflow if support operations require full feedback details.
- Add CSP and HSTS once production hosting details are finalized.
- Add dependency audit policy to the release checklist.
