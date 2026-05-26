# Competition DOCX Resource Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the competition resource library with the supplied cleaned Word dataset while preserving conservative eligibility filtering for non-US-high-school and non-US-status students.

**Architecture:** Extract the DOCX paragraph text into the maintained Markdown data file without inventing new facts. Expand `competition-recommender.mjs` to parse its detailed heading-and-fields format while retaining legacy compact-format support, then continue routing parsed descriptions through the existing shared eligibility classifier.

**Tech Stack:** DOCX paragraph extraction using bundled Python runtime, browser ES modules, Node.js assertion tests.

---

### Task 1: Detailed competition parsing

**Files:**
- Modify: `tests/competition-recommender.test.mjs`
- Modify: `competition-recommender.mjs`

- [ ] Add a detailed Markdown fixture using `##` category, `###` subgroup, `####` item, and `- **官网** / 时间 / 简介 / 奖项 / 评级` fields.
- [ ] Run `node tests/competition-recommender.test.mjs` and confirm it fails because detailed blocks are not parsed.
- [ ] Implement detailed-block parsing and normalize categories such as `📐 一、数学类（Mathematics）` to `数学类`, retaining compact-list parsing for existing inputs.
- [ ] Run `node tests/competition-recommender.test.mjs` and confirm it passes.

### Task 2: Imported data and explicit eligibility

**Files:**
- Replace: `data/competitions.md`
- Create: `tests/competition-data-import.test.mjs`
- Modify: `tests/resource-eligibility.test.mjs`
- Modify: `resource-eligibility.mjs`
- Modify: `package.json`

- [ ] Add failing tests expecting `527` parsed imported entries and treating an explicit `美国高中生团队编程邀请赛` description as a US-high-school-only conflict for non-US-high-school users.
- [ ] Run the tests and confirm failure against the old data/parser and eligibility matcher.
- [ ] Extract the supplied DOCX paragraph text into `data/competitions.md` with the bundled document runtime and extend explicit school-audience detection.
- [ ] Add the import regression test to `npm test` and run it successfully.

### Task 3: Resource display and verification

**Files:**
- Modify: `tests/resource-library-layout.test.mjs`
- Modify: `resource-library.js`

- [ ] Add a failing layout assertion requiring competition cards to display imported description and time fields.
- [ ] Render the detailed competition fields while retaining eligibility tags and excluded reasons.
- [ ] Run `npm.cmd run check` and `npm.cmd test`, then query imported resources under a mainland-China/non-US-status condition to confirm explicit US-high-school-only competitions are excluded.
