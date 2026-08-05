# Application Robot Personal Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate optional student-specific context from the application robot's default knowledge RAG, with an explicit UI control and no historical planning snapshots.

**Architecture:** Carry a strict `usePersonalContext` boolean from the browser through HTTP jobs and LangGraph into retrieval. Static knowledge retrieval always runs; personal services are called only when the boolean is `true`, and the planning service exposes only the most recently updated current plan. Retrieval sources expose a `scope` field so the UI can distinguish personal evidence from knowledge evidence.

**Tech Stack:** Browser ESM, native Node HTTP server, LangGraph, better-sqlite3, plain Node tests, CSS.

---

## File map

- Modify `src/server/planning-service.mjs`: add a narrow current-plan lookup that never reads snapshots.
- Modify `src/server/deepseek-rag-service.mjs`: gate personal document loading, propagate the flag, update prompt boundaries, and serialize source scope.
- Modify `src/server/langgraph-rag-workflow.mjs`: include `usePersonalContext` in graph state.
- Modify `src/server/admissions-knowledge-graph-adapter.mjs`: prevent implicit personal-data reads when the flag is off.
- Modify `server.mjs`: propagate the boolean through synchronous, streaming, and background-job paths without embedding personal records in job payloads.
- Modify `src/client/ask-deepseek.js`: manage the switch, request payload, workflow auto-enable behavior, conditional progress text, and reset behavior.
- Modify `ask-deepseek.html` and `styles.css`: add and style the disclosure/control; correct page copy.
- Modify focused tests under `tests/`: lock down privacy boundaries, request propagation, source scope, and responsive page structure.

### Task 1: Return only the most recent current plan

**Files:**
- Modify: `src/server/planning-service.mjs:223-271`
- Test: `tests/planning-service.test.mjs`

- [ ] **Step 1: Write the failing planning-service test**

Create two saved plans and a snapshot, then assert the new method returns the most recently updated current plan and no snapshot fields:

```js
const ragPlan = planning.getLatestRagPlan(student);
assert.equal(ragPlan.sourceType, "current_plan");
assert.equal(ragPlan.planName, "冲刺规划");
assert.equal(ragPlan.draft.rawAnswer, "answer");
assert.equal(Object.hasOwn(ragPlan, "snapshotId"), false);
assert.equal(Object.hasOwn(ragPlan, "profile"), false);
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `node --import tsx tests/planning-service.test.mjs`

Expected: failure because `planning.getLatestRagPlan` is not defined.

- [ ] **Step 3: Implement the narrow lookup**

Add a method that uses the existing ownership and draft parsers but never queries `planning_snapshots`:

```js
function getLatestRagPlan(user) {
  const userId = requireUserId(user);
  ensureDefaultPlan(userId);
  const plan = db.prepare(`
    SELECT id, name, current_draft_json, updated_at AS updatedAt
    FROM planning_projects
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `).get(userId);
  if (!plan) return null;
  return {
    sourceType: "current_plan",
    planId: plan.id,
    planName: plan.name,
    savedAt: plan.updatedAt,
    draft: parseDraft(plan.current_draft_json),
  };
}
```

Export `getLatestRagPlan` from the returned service object. Keep `listRagBackups` for existing planning functionality but remove application-robot call sites later.

- [ ] **Step 4: Re-run the targeted test**

Run: `node --import tsx tests/planning-service.test.mjs`

Expected: exit code 0.

### Task 2: Gate personal retrieval and graph evidence

**Files:**
- Modify: `src/server/deepseek-rag-service.mjs:178-268, 590-720, 960-1125, 1260-1345`
- Modify: `src/server/langgraph-rag-workflow.mjs:5-20`
- Modify: `src/server/admissions-knowledge-graph-adapter.mjs:12-38`
- Test: `tests/deepseek-rag-retriever.test.mjs`
- Test: `tests/admissions-knowledge-graph.test.mjs`
- Test: `tests/worker-abort-signal.test.mjs`

- [ ] **Step 1: Add failing default-off and opt-in retrieval tests**

Use spies that throw if personal services are called in the default case:

```js
const privateCalls = [];
const retriever = createRagRetriever({
  root: process.cwd(),
  planning: {
    getProfile() { privateCalls.push("profile"); throw new Error("unexpected personal read"); },
    getLatestRagPlan() { privateCalls.push("plan"); throw new Error("unexpected personal read"); },
  },
  activityPortfolio: {
    getPortfolio() { privateCalls.push("portfolio"); throw new Error("unexpected personal read"); },
  },
});
const knowledgeOnly = await retriever.retrieve({ user: { id: 1 }, question: "What is ED?" });
assert.deepEqual(privateCalls, []);
assert.ok(knowledgeOnly.sources.every((source) => source.scope === "knowledge"));
```

Add an opt-in fixture containing a latest-plan marker and a historical-snapshot marker. Assert only the latest marker appears, personal sources have `scope === "personal"`, and the history marker is absent.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --import tsx tests/deepseek-rag-retriever.test.mjs`

Expected: current implementation calls personal services by default and lacks `scope`.

- [ ] **Step 3: Propagate the strict boolean through LangGraph**

Add `usePersonalContext: Annotation()` to `RagAnswerState`. Normalize only with strict equality in `answerQuestion`:

```js
const includePersonalContext = usePersonalContext === true;
return answerGraph.invoke({
  user,
  question: normalizedQuestion,
  historySummary: normalizedHistorySummary,
  assistantProfile,
  usePersonalContext: includePersonalContext,
  env,
  model,
  signal,
});
```

Forward the field from `retrieveSources` into `orchestratedRetriever.retrieve`.

- [ ] **Step 4: Gate document construction**

In `createRagRetriever.retrieve`, always load static documents. Only when `usePersonalContext === true`, call `planning.getProfile`, `activityPortfolio.getPortfolio`, and `planning.getLatestRagPlan`. Build student documents from `{ profile, portfolio, currentPlan }`; remove `backups` and its loop from the RAG path.

Return `missingFields: []` when personal context is off. Set source scope during serialization:

```js
const PERSONAL_SOURCE_TYPES = new Set(["student-backup", "application-portfolio"]);

export function serializeRagSource(source) {
  const type = getRagDocumentType(source);
  return {
    id: getRagDocumentId(source),
    type,
    scope: PERSONAL_SOURCE_TYPES.has(type) ? "personal" : "knowledge",
    typeLabel: PERSONAL_SOURCE_TYPES.has(type) ? "个人上下文" : SOURCE_TYPE_LABELS[type] || type,
    title: getRagDocumentTitle(source),
    snippet: formatSourceSnippet(getRagDocumentText(source)),
  };
}
```

When personal context is off, do not call `ensureBaselineContext` for personal types. Static knowledge baselines may remain.

- [ ] **Step 5: Gate knowledge-graph evidence**

Change the static graph adapter so `usePersonalContext === false` resolves profile and portfolio to empty objects without calling services. When true, it may use passed values or retrieve current values. Ensure school-selection callers that explicitly pass a portfolio retain their current behavior.

- [ ] **Step 6: Make prompt behavior truthful**

Pass the boolean to `buildUserMessage`. Replace unconditional claims about available student backups with conditional text:

```js
usePersonalContext
  ? "本次已启用个人上下文，可结合当前画像、申请档案和最近更新规划。"
  : "本次未启用个人上下文；不得假设已读取用户画像、申请档案或规划。"
```

Do not modify `prompts/us-college-admissions-strategist-agent.md`.

- [ ] **Step 7: Re-run focused service tests**

Run:

```powershell
node --import tsx tests/deepseek-rag-retriever.test.mjs
node --import tsx tests/admissions-knowledge-graph.test.mjs
node --import tsx tests/worker-abort-signal.test.mjs
```

Expected: all exit with code 0.

### Task 3: Propagate consent through HTTP and jobs

**Files:**
- Modify: `server.mjs:550-578, 794-806, 924-954`
- Test: `tests/deepseek-rag.test.mjs`
- Test: `tests/deepseek-workflow-rag.test.mjs`

- [ ] **Step 1: Add failing API-boundary assertions**

Update requests that expect personal sources to include `usePersonalContext: true`. Add a default request and assert no personal source types are returned. Capture durable job payloads and assert:

```js
assert.equal(capturedJob.payload.usePersonalContext, true);
assert.equal(Object.hasOwn(capturedJob.payload, "profile"), false);
assert.equal(Object.hasOwn(capturedJob.payload, "portfolio"), false);
assert.equal(Object.hasOwn(capturedJob.payload, "backups"), false);
```

- [ ] **Step 2: Run HTTP tests and verify they fail**

Run:

```powershell
node --import tsx tests/deepseek-rag.test.mjs
node --import tsx tests/deepseek-workflow-rag.test.mjs
```

Expected: new default-off assertions fail before server propagation is implemented.

- [ ] **Step 3: Update every application-robot boundary**

Pass `usePersonalContext: payload.usePersonalContext === true` into synchronous answers, streaming answers, and background answers. Build RAG job payloads as metadata only:

```js
const jobPayload = {
  user,
  question: payload.question,
  historySummary: payload.historySummary,
  assistantProfile: payload.assistantProfile,
  usePersonalContext: payload.usePersonalContext === true,
};
```

Delete eager `getProfile`, `getPortfolio`, and `listRagBackups` calls from `/api/deepseek-rag-jobs`. Ensure worker handlers forward the boolean into `answerQuestion`.

- [ ] **Step 4: Re-run HTTP tests**

Run the two commands from Step 2.

Expected: both exit with code 0 and no real API key is used.

### Task 4: Add the explicit browser control

**Files:**
- Modify: `ask-deepseek.html:47-65, 118-155`
- Modify: `src/client/ask-deepseek.js:6-32, 260-299, 494-500, 674-710, 1041-1051, 1094-1110`
- Modify: `styles.css:2940-3030, 7770-7810, 8838-8850`
- Test: `tests/ask-deepseek-page.test.mjs`

- [ ] **Step 1: Add failing static page tests**

Assert the application page includes the checkbox and disclosure, the inspiration page does not, request construction includes the strict boolean, workflows set it to true before calling `askDeepSeek`, and reset returns it to false.

```js
assert.ok(pageHtml.includes('id="deepSeekPersonalContext"'));
assert.ok(pageHtml.includes("不会读取历史快照"));
assert.doesNotMatch(inspirationPageHtml, /deepSeekPersonalContext/);
assert.ok(script.includes("usePersonalContext: personalContextToggle?.checked === true"));
```

- [ ] **Step 2: Run the page test and verify failure**

Run: `node --import tsx tests/ask-deepseek-page.test.mjs`

Expected: failure because the control and request field do not exist.

- [ ] **Step 3: Add accessible markup and truthful copy**

Add a checkbox below the textarea only on `ask-deepseek.html`:

```html
<label class="personal-context-control" for="deepSeekPersonalContext">
  <input id="deepSeekPersonalContext" type="checkbox">
  <span>
    <strong>参考我的申请规划</strong>
    <small>开启后会读取当前画像、申请档案和最近更新的一份规划；不会读取历史快照。</small>
  </span>
</label>
```

Update the page summary and initial greeting so they do not claim personal data is always read. Add a short disclosure in the workflow region that quick tasks automatically use personal context. Update the browser-module cache-busting query.

- [ ] **Step 4: Implement client state and request construction**

Query the checkbox, send its strict checked state in `buildRagRequestPayload`, and set it before an application workflow submits:

```js
function buildRagRequestPayload(question, historySummary) {
  return {
    question,
    historySummary,
    ...(!IS_INSPIRATION_PROFILE
      ? { usePersonalContext: personalContextToggle?.checked === true }
      : {}),
    ...(PAGE_ASSISTANT_PROFILE ? { assistantProfile: PAGE_ASSISTANT_PROFILE } : {}),
  };
}
```

Set conditional progress copy based on the captured request flag. On clear, uncheck the toggle. Disable the toggle while a request is being submitted.

- [ ] **Step 5: Style desktop and mobile layouts**

Use the existing form tokens and a compact flex layout. At mobile widths, keep the checkbox aligned to the top and allow the disclosure to wrap without horizontal overflow. Do not redesign the chat page.

- [ ] **Step 6: Re-run the page test**

Run: `node --import tsx tests/ask-deepseek-page.test.mjs`

Expected: exit code 0.

### Task 5: Full verification and browser smoke test

**Files:**
- Modify only files required by failures from the checks above.

- [ ] **Step 1: Run syntax and focused RAG tests**

Run:

```powershell
npm run check
node --import tsx tests/planning-service.test.mjs
node --import tsx tests/deepseek-rag-retriever.test.mjs
node --import tsx tests/deepseek-rag.test.mjs
node --import tsx tests/deepseek-workflow-rag.test.mjs
node --import tsx tests/ask-deepseek-page.test.mjs
```

Expected: every command exits with code 0.

- [ ] **Step 2: Run full repository verification**

Run: `npm run verify`

Expected: syntax, contracts, all tests, retrieval evaluation, and GraphRAG evaluation pass.

- [ ] **Step 3: Start a bounded local server for smoke testing**

Start `node --import tsx server.mjs` in a hidden background process with an explicit PID, use an unused verified port, poll readiness with a timeout, and clean up only that PID after testing. Do not read `.env` or a local database.

- [ ] **Step 4: Smoke test at desktop and mobile widths**

At approximately 1280px and 390px widths, verify:

- the application robot loads without console-breaking errors;
- the personal-context control is visible, unchecked, and keyboard accessible;
- the explanatory copy wraps without overlap or horizontal scrolling;
- the question input and send button remain visible and clickable;
- the inspiration robot does not show the control.

- [ ] **Step 5: Review privacy and the final diff**

Run:

```powershell
rg -n "listRagBackups|usePersonalContext|scope" src/server/deepseek-rag-service.mjs server.mjs src/client/ask-deepseek.js
git diff --check
git status --short
```

Confirm no application-robot request reads snapshots, no job payload embeds personal records, and no `.env`, database, export, or generated file is included.
