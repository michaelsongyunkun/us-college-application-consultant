# Admin Dashboard Information Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the crowded administrator page into an operational dashboard with period-aware summary metrics, focused tabs, and quieter detail tables.

**Architecture:** Keep the existing admin-only endpoint and SQLite event sources. Extend its response with derived overview counters and an optional usage-event filter, then render one global toolbar, summary cards, and three tabbed views in the existing vanilla JavaScript frontend.

**Tech Stack:** Node.js ES modules, SQLite via `better-sqlite3`, HTML/CSS, vanilla JavaScript tests using `node:assert`.

---

### Task 1: Operational Summary Data

**Files:**
- Modify: `auth-service.mjs`
- Modify: `server.mjs`
- Test: `tests/auth-service.test.mjs`
- Test: `tests/server-auth.test.mjs`

- [ ] Write assertions for `overview.activeUsers`, `overview.planGenerations`, `overview.wordExports`, `overview.recommendationRefreshes`, and `overview.failedLogins`.
- [ ] Write an assertion that `eventType=export_word` limits behavior rows without changing overview totals.
- [ ] Run `node tests/auth-service.test.mjs` and `node tests/server-auth.test.mjs` and observe missing overview/filter failures.
- [ ] Add aggregate SQLite queries using date/user filters for overview, and apply `eventType` only to behavior summary/detail queries.
- [ ] Pass `eventType` from `/api/admin/login-dashboard` query parameters and rerun both tests.

### Task 2: Focused Dashboard Navigation

**Files:**
- Create: `tests/admin-dashboard-layout.test.mjs`
- Modify: `package.json`
- Modify: `admin.html`
- Modify: `admin-dashboard.js`
- Modify: `styles.css`

- [ ] Assert the dashboard exposes global date/user filters, an activity-type behavior filter, tab buttons/panels, operational metric ids, and expandable technical details.
- [ ] Run `node tests/admin-dashboard-layout.test.mjs` and observe failures because the current single-page layout lacks those controls.
- [ ] Replace the sticky sidebar/stacked sections with a toolbar, five summary cards, and `行为趋势` / `用户分析` / `安全日志` tab panels.
- [ ] Update rendering to populate overview values, switch tabs accessibly, scope status filtering to security logs, and render IP/user-agent within expandable details.
- [ ] Add tab, toolbar, metric, and details styles; register the new layout test in `npm test`; rerun the targeted test.

### Task 3: Verification

**Files:**
- Verify: `tests/admin-dashboard-layout.test.mjs`
- Verify: `tests/auth-service.test.mjs`
- Verify: `tests/server-auth.test.mjs`

- [ ] Run `npm.cmd run check`.
- [ ] Run `npm.cmd test`.
- [ ] Check the admin page in the local browser when local navigation is available; otherwise record the browser limitation alongside automated verification.
