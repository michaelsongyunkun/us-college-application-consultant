# Resource Eligibility School Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent clearly ineligible resources from being surfaced in either the resource library or generated project recommendations when published participation requirements conflict with a Chinese or non-US-high-school student's conditions.

**Architecture:** Keep eligibility decisions in `resource-eligibility.mjs`, separate from DOM rendering and recommendation scoring. Extend the resource library's page-local filter and the homepage student-background form with structured eligibility context, then apply that same classifier before recommendation candidates are scored.

**Tech Stack:** Browser ES modules, static HTML/CSS, Node.js assertion tests.

---

### Task 1: Eligibility rule coverage

**Files:**
- Modify: `tests/resource-eligibility.test.mjs`
- Modify: `resource-eligibility.mjs`

- [ ] Add failing assertions for a resource limited to US high-school/local students and a resource excluding mainland China high-school students.
- [ ] Run `node tests/resource-eligibility.test.mjs` and confirm failure because those eligibility restrictions are not classified yet.
- [ ] Add conservative text classification and exclude only when the structured user condition makes the conflict explicit.
- [ ] Run `node tests/resource-eligibility.test.mjs` and confirm it passes.

### Task 2: Resource library input wiring

**Files:**
- Modify: `tests/resource-library-layout.test.mjs`
- Modify: `resource-library.html`
- Modify: `resource-library.js`
- Modify: `styles.css`

- [ ] Add a failing page-contract assertion requiring a school-context selector in “我的可参与条件”.
- [ ] Run `node tests/resource-library-layout.test.mjs` and confirm failure because the selector is absent.
- [ ] Add a page-local selector for mainland China, other non-US, and US high-school contexts; pass its value to `classifyResource`; expose clear eligibility tags/reasons; allow the form grid to accommodate the extra control.
- [ ] Run `node tests/resource-library-layout.test.mjs` and confirm it passes.

### Task 3: Verification

**Files:**
- Verify only

- [ ] Run `npm test`.
- [ ] Open `resource-library.html` through the local app and exercise a mainland-China-high-school condition against identity-limited resources, confirming excluded results show their reason.

### Task 4: Homepage recommendations

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `competition-recommender.mjs`
- Modify: `summer-school-recommender.mjs`
- Modify: `word-export.mjs`
- Test: `tests/planning-workspace-layout.test.mjs`
- Test: `tests/competition-recommender.test.mjs`
- Test: `tests/summer-school-recommender.test.mjs`
- Test: `tests/word-export-profile-labels.test.mjs`

- [ ] Add failing assertions that homepage eligibility fields exist and clearly ineligible recommended candidates are excluded.
- [ ] Add the non-US/US-high-school and US-status selectors to the saved student profile, while stripping those fields from Agent activity-planning inputs.
- [ ] Apply the common eligibility classifier before summer-school and competition scoring, and report how many explicit conflicts were excluded.
- [ ] Export the visible eligibility fields with parent-facing labels and run the complete test suite.
