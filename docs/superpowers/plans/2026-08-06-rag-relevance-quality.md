# RAG Relevance and Quality Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make application, major-matching, and school-selection RAG return fewer and more relevant sources while eliminating false degradation warnings and preserving recall, privacy, and latency.

**Architecture:** Introduce one deterministic domain-level relevance selector, then route local, PostgreSQL, and graph candidates through it before context construction. Make request scope authoritative at the server, derive quality expectations from that scope, and enforce runtime precision/recall/latency gates before release.

**Tech Stack:** Node.js ESM, TypeScript via `tsx`, LangGraph, browser ESM, native Node HTTP, PostgreSQL hybrid retrieval, plain Node assertion tests.

---

## Approved design and execution constraints

- Read first: `docs/superpowers/specs/2026-08-06-rag-relevance-quality-design.md`.
- Preserve: `docs/superpowers/specs/2026-08-05-application-robot-personal-context-design.md`.
- Do not read `.env` or local database files.
- Do not modify `prompts/us-college-admissions-strategist-agent.md` or `data/*.md`.
- Run `git status --short` before each task and preserve unrelated changes.
- Use `apply_patch` for edits.
- Use no real DeepSeek, embedding, reranker, SMTP, or database credentials in tests.
- Tasks are intentionally sequential because Tasks 2–6 share request, candidate, and quality contracts. Do not parallelize edits to the same files.

## File map

- Create `src/domain/retrieval-relevance.mjs`: pure score normalization, thresholding, score-drop cutoff, deduplication, budgets, and diagnostics.
- Create `tests/retrieval-relevance.test.mjs`: deterministic selector tests.
- Modify `src/client/major-encyclopedia.js`: explicitly opt dedicated major matching into personal context.
- Modify `major-encyclopedia.html`: update the cache-busting query for the changed browser module.
- Modify `server.mjs`: normalize `major-match` to personal context at the HTTP/job boundary.
- Modify `src/server/deepseek-rag-service.mjs`: compact major retrieval query, local candidate selection, budgets, request-aware quality, and selected-model propagation.
- Modify `src/server/langgraph-rag-workflow.mjs`: carry the selected model into quality evaluation.
- Modify `src/server/ai-quality.mjs`: request-aware source groups and `pass` / `limited_evidence` / `review_required` states.
- Modify `src/client/ask-deepseek.js`: render targeted quality states instead of a generic fallback label.
- Modify `styles.css`: add a neutral visual state for limited evidence.
- Modify `ask-deepseek.html`: update browser-module cache busting if `ask-deepseek.js` changes.
- Modify `src/domain/admissions-knowledge-graph.mjs`: graph anchoring metadata and an eight-fact default.
- Modify `src/server/retrieval-orchestrator.mjs`: filtered graph merge and final graph budget.
- Modify `src/infrastructure/hybrid-retriever.ts`: permit rerankers to return fewer high-quality results.
- Modify `src/infrastructure/postgres-rag-retriever.ts`: make PostgreSQL candidates compete with local candidates under one budget.
- Modify `src/server/school-selection-service.mjs`: use the same precision selector for school documents.
- Create `src/infrastructure/rag-relevance-golden-eval.ts`: runtime precision/noise/budget/latency evaluator.
- Create `tests/fixtures/rag-relevance-golden.json`: representative positive, negative, Chinese, and English cases.
- Create `tests/rag-relevance-golden-eval.test.mjs`: evaluator unit tests.
- Create `scripts/evaluate-rag-relevance-golden.mjs`: actual local runtime evaluation entry point.
- Modify `package.json`: add the runtime relevance gate to `npm run verify`.
- Modify focused tests listed under each task.

### Task 1: Build the deterministic relevance selector

**Files:**
- Create: `src/domain/retrieval-relevance.mjs`
- Create: `tests/retrieval-relevance.test.mjs`

- [ ] **Step 1: Write the failing selector test**

Create `tests/retrieval-relevance.test.mjs` with these exact behaviors:

```js
import assert from "node:assert/strict";
import {
  RETRIEVAL_RELEVANCE_POLICY_VERSION,
  selectRelevantEvidence,
} from "../src/domain/retrieval-relevance.mjs";

const candidates = [
  { id: "local-1", channel: "local-keyword", rawScore: 10, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-2", channel: "local-keyword", rawScore: 8, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-3", channel: "local-keyword", rawScore: 4, type: "major-encyclopedia", scope: "knowledge" },
  { id: "local-4", channel: "local-keyword", rawScore: 1, type: "school-encyclopedia", scope: "knowledge" },
  { id: "pg-1", channel: "postgres-hybrid", rawScore: 0.04, type: "resource-library", scope: "knowledge" },
  { id: "pg-2", channel: "postgres-hybrid", rawScore: 0.02, type: "resource-library", scope: "knowledge" },
  { id: "invalid", channel: "local-keyword", rawScore: 0, type: "resource-library", scope: "knowledge" },
];

const selection = selectRelevantEvidence(candidates, {
  maxResults: 4,
  minNormalizedScore: 0.55,
  scoreDropThreshold: 0.25,
});

assert.equal(RETRIEVAL_RELEVANCE_POLICY_VERSION, "retrieval-relevance@2026-08-06");
assert.deepEqual(selection.selected.map((item) => item.id), ["local-1", "pg-1", "local-2"]);
assert.ok(selection.selected.every((item) => item.normalizedScore >= 0.55));
assert.ok(selection.rejected.some((item) => item.id === "invalid" && item.rejectionReason === "non_positive_score"));
assert.ok(selection.rejected.some((item) => item.id === "local-3" && item.rejectionReason === "score_drop"));
assert.equal(selection.diagnostics.generatedCandidates, 7);
assert.equal(selection.diagnostics.selectedCandidates, 3);

const deduped = selectRelevantEvidence([
  { id: "same", channel: "local-keyword", rawScore: 5, type: "major-encyclopedia" },
  { id: "same", channel: "postgres-hybrid", rawScore: 1, type: "major-encyclopedia" },
], { maxResults: 8 });
assert.equal(deduped.selected.length, 1);

const scoped = selectRelevantEvidence([
  { id: "personal-1", channel: "personal", rawScore: 1, scope: "personal" },
  { id: "personal-2", channel: "personal", rawScore: 0.9, scope: "personal" },
  { id: "personal-3", channel: "personal", rawScore: 0.8, scope: "personal" },
  { id: "personal-4", channel: "personal", rawScore: 0.7, scope: "personal" },
], { maxResults: 8, scopeLimits: { personal: 3 } });
assert.deepEqual(scoped.selected.map((item) => item.id), ["personal-1", "personal-2", "personal-3"]);

assert.deepEqual(selectRelevantEvidence([], { maxResults: 8 }).selected, []);
```

- [ ] **Step 2: Run the test and confirm the intended failure**

Run:

```powershell
node --import tsx tests/retrieval-relevance.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/domain/retrieval-relevance.mjs`.

- [ ] **Step 3: Implement the pure selector**

Create `src/domain/retrieval-relevance.mjs`:

```js
export const RETRIEVAL_RELEVANCE_POLICY_VERSION = "retrieval-relevance@2026-08-06";

const DEFAULT_MIN_NORMALIZED_SCORE = 0.55;
const DEFAULT_SCORE_DROP_THRESHOLD = 0.25;

export function selectRelevantEvidence(candidates = [], {
  maxResults = 8,
  minNormalizedScore = DEFAULT_MIN_NORMALIZED_SCORE,
  scoreDropThreshold = DEFAULT_SCORE_DROP_THRESHOLD,
  scopeLimits = {},
} = {}) {
  const rejected = [];
  const valid = [];
  for (const [index, candidate] of (candidates || []).entries()) {
    const rawScore = Number(candidate?.rawScore);
    const id = String(candidate?.id || candidate?.sourceId || "").trim();
    if (!id || !Number.isFinite(rawScore) || rawScore <= 0) {
      rejected.push({ ...candidate, id, rejectionReason: "non_positive_score" });
      continue;
    }
    valid.push({ ...candidate, id, rawScore, _inputIndex: index });
  }

  const byChannel = new Map();
  for (const candidate of valid) {
    const channel = String(candidate.channel || "default");
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push(candidate);
  }

  const eligible = [];
  for (const [channel, channelCandidates] of byChannel) {
    const ordered = [...channelCandidates].sort(compareRawCandidates);
    const topScore = ordered[0]?.rawScore || 0;
    let previousNormalized = 1;
    let dropped = false;
    for (const candidate of ordered) {
      const normalizedScore = topScore ? candidate.rawScore / topScore : 0;
      const normalized = { ...candidate, channel, normalizedScore };
      if (dropped || previousNormalized - normalizedScore >= scoreDropThreshold) {
        dropped = true;
        rejected.push({ ...normalized, rejectionReason: "score_drop" });
      } else if (normalizedScore < minNormalizedScore) {
        rejected.push({ ...normalized, rejectionReason: "below_relevance_floor" });
      } else {
        eligible.push(normalized);
      }
      previousNormalized = normalizedScore;
    }
  }

  const bestById = new Map();
  for (const candidate of eligible.sort(compareNormalizedCandidates)) {
    const existing = bestById.get(candidate.id);
    if (!existing) bestById.set(candidate.id, candidate);
    else rejected.push({ ...candidate, rejectionReason: "duplicate" });
  }

  const scopeCounts = new Map();
  const selected = [];
  for (const candidate of [...bestById.values()].sort(compareNormalizedCandidates)) {
    if (selected.length >= positiveInteger(maxResults, 8)) {
      rejected.push({ ...candidate, rejectionReason: "result_budget" });
      continue;
    }
    const scope = String(candidate.scope || "knowledge");
    const scopeLimit = Number(scopeLimits[scope]);
    const count = scopeCounts.get(scope) || 0;
    if (Number.isFinite(scopeLimit) && count >= scopeLimit) {
      rejected.push({ ...candidate, rejectionReason: "scope_budget" });
      continue;
    }
    selected.push(stripInternalFields(candidate));
    scopeCounts.set(scope, count + 1);
  }

  return {
    selected,
    rejected: rejected.map(stripInternalFields),
    diagnostics: {
      policyVersion: RETRIEVAL_RELEVANCE_POLICY_VERSION,
      generatedCandidates: (candidates || []).length,
      eligibleCandidates: eligible.length,
      selectedCandidates: selected.length,
      rejectedCandidates: rejected.length,
      minNormalizedScore,
      scoreDropThreshold,
      topNormalizedScore: selected[0]?.normalizedScore || 0,
    },
  };
}

function compareRawCandidates(left, right) {
  return right.rawScore - left.rawScore
    || String(left.id).localeCompare(String(right.id))
    || left._inputIndex - right._inputIndex;
}

function compareNormalizedCandidates(left, right) {
  return right.normalizedScore - left.normalizedScore
    || right.rawScore - left.rawScore
    || String(left.id).localeCompare(String(right.id));
}

function stripInternalFields(candidate) {
  const { _inputIndex, ...publicCandidate } = candidate || {};
  return publicCandidate;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
```

- [ ] **Step 4: Run the selector test**

Run:

```powershell
node --import tsx tests/retrieval-relevance.test.mjs
```

Expected: exit code `0`.

- [ ] **Step 5: Commit the selector**

```powershell
git add -- src/domain/retrieval-relevance.mjs tests/retrieval-relevance.test.mjs
git commit -m "feat: add deterministic rag relevance selector"
```

### Task 2: Correct major-match scope and request-aware source expectations

**Files:**
- Modify: `src/client/major-encyclopedia.js:350-381`
- Modify: `major-encyclopedia.html` browser-module query
- Modify: `server.mjs:795-806, 926-960`
- Modify: `src/server/deepseek-rag-service.mjs:212-269, 452-476`
- Modify: `src/server/ai-quality.mjs:68-137`
- Test: `tests/major-encyclopedia-layout.test.mjs`
- Test: `tests/deepseek-rag.test.mjs`
- Test: `tests/ai-quality.test.mjs`

- [ ] **Step 1: Add failing browser and server scope assertions**

In `tests/major-encyclopedia-layout.test.mjs`, add:

```js
assert.ok(
  script.includes('assistantProfile: "major-match", usePersonalContext: true'),
  "Dedicated major matching must explicitly opt into the saved application profile.",
);
```

In `tests/deepseek-rag.test.mjs`, capture the major-match retrieval input or LLM prompt and add a request that omits the flag:

```js
const legacyMajorMatchResponse = await post(
  "/api/deepseek-rag",
  {
    question: "请根据我的申请档案自动匹配适合探索的美国本科专业。",
    assistantProfile: "major-match",
  },
  cookie,
);
assert.equal(legacyMajorMatchResponse.status, 200);
const legacyMajorBody = await legacyMajorMatchResponse.json();
assert.ok(legacyMajorBody.sources.some((source) => source.type === "application-portfolio"));
assert.equal(legacyMajorBody.quality.retrieval.retrievalHitRate, 1);
assert.equal(legacyMajorBody.quality.review.fallback.triggered, false);
```

- [ ] **Step 2: Add failing request-aware quality tests**

Replace the old fixed expectation assertion in `tests/ai-quality.test.mjs` with:

```js
assert.deepEqual(
  getExpectedRagSourceTypes("school", { usePersonalContext: false }),
  ["school-encyclopedia"],
);
assert.deepEqual(
  getExpectedRagSourceTypes("school", { usePersonalContext: true }),
  ["application-portfolio", "school-encyclopedia"],
);
assert.deepEqual(
  getExpectedRagSourceTypes("general", { usePersonalContext: false }),
  [],
);
assert.deepEqual(
  getExpectedRagSourceTypes("general", { usePersonalContext: true }),
  [["application-portfolio", "student-backup"]],
);
assert.deepEqual(
  getExpectedRagSourceTypes("major", { assistantProfile: "major-match", usePersonalContext: true }),
  ["application-portfolio", "major-encyclopedia"],
);
```

- [ ] **Step 3: Run the three tests and confirm failure**

Run:

```powershell
node --import tsx tests/major-encyclopedia-layout.test.mjs
node --import tsx tests/ai-quality.test.mjs
node --import tsx tests/deepseek-rag.test.mjs
```

Expected: the client payload assertion and request-aware expectation assertions fail.

- [ ] **Step 4: Normalize major-match context at both browser and server boundaries**

In `src/client/major-encyclopedia.js`, replace the job body with:

```js
body: JSON.stringify({
  question: prompt,
  assistantProfile: "major-match",
  usePersonalContext: true,
}),
```

Update the cache-busting query for `src/client/major-encyclopedia.js` in `major-encyclopedia.html`.

In each `/api/deepseek-rag`, `/api/deepseek-rag/stream`, and `/api/deepseek-rag-jobs` boundary in `server.mjs`, normalize once before calling or queuing:

```js
const usePersonalContext = payload.assistantProfile === "major-match"
  || payload.usePersonalContext === true;
```

Pass `usePersonalContext` instead of reading `payload.usePersonalContext` directly. Job payloads continue carrying only the boolean, never profile or portfolio text.

In `createDeepSeekRagService.answerQuestion`, enforce the same invariant for worker and older callers:

```js
const normalizedUsePersonalContext = assistantProfile === "major-match"
  || usePersonalContext === true;
```

Pass `normalizedUsePersonalContext` to the graph state.

- [ ] **Step 5: Implement request-aware expected source groups**

Replace `getExpectedRagSourceTypes` in `src/server/ai-quality.mjs` with:

```js
export function getExpectedRagSourceTypes(intent = "general", {
  usePersonalContext = false,
  assistantProfile = "",
} = {}) {
  if (assistantProfile === "major-match") {
    return ["application-portfolio", "major-encyclopedia"];
  }
  const knowledgeType = {
    school: "school-encyclopedia",
    major: "major-encyclopedia",
    resource: "resource-library",
  }[String(intent || "general")];
  const personalGroup = {
    academic: ["application-portfolio", "student-backup"],
    general: ["application-portfolio", "student-backup"],
    profile: ["application-portfolio", "student-backup"],
  }[String(intent || "general")] || ["application-portfolio"];
  return [
    ...(usePersonalContext === true ? [personalGroup] : []),
    ...(knowledgeType ? [knowledgeType] : []),
  ];
}
```

Update `evaluateAiAnswerQuality` so a string is one source group and an array is an “any-of” group:

```js
const expectedGroups = (expectedSourceTypes || []).map((value) => (
  Array.isArray(value) ? uniqueStrings(value) : uniqueStrings([value])
)).filter((group) => group.length);
const coveredGroups = expectedGroups.filter((group) => group.some((type) => sourceTypes.has(type)));
const missingGroups = expectedGroups.filter((group) => !group.some((type) => sourceTypes.has(type)));
const retrievalHitRate = expectedGroups.length
  ? roundMetric(coveredGroups.length / expectedGroups.length)
  : normalizedSources.length ? 1 : 0;
```

Return both flattened compatibility fields and auditable groups:

```js
retrieval: {
  expectedSourceTypes: uniqueStrings(expectedGroups.flat()),
  expectedSourceGroups: expectedGroups,
  coveredSourceTypes: uniqueStrings(coveredGroups.flat()),
  missingSourceTypes: uniqueStrings(missingGroups.flat()),
  retrievalHitRate,
  sourceCount: normalizedSources.length,
},
```

In `evaluateRagGraphQuality`, call:

```js
expectedSourceTypes: getExpectedRagSourceTypes(retrieval.intent, {
  usePersonalContext,
  assistantProfile,
}),
```

Add `usePersonalContext` to the function parameters so it receives the LangGraph state.

- [ ] **Step 6: Re-run focused scope and quality tests**

Run the three commands from Step 3.

Expected: all exit with code `0`; a major-match request without the flag still receives personal grounding and no deterministic low-hit warning.

- [ ] **Step 7: Commit request-scope corrections**

```powershell
git add -- src/client/major-encyclopedia.js major-encyclopedia.html server.mjs src/server/deepseek-rag-service.mjs src/server/ai-quality.mjs tests/major-encyclopedia-layout.test.mjs tests/deepseek-rag.test.mjs tests/ai-quality.test.mjs
git commit -m "fix: align rag quality with request scope"
```

### Task 3: Apply relevance selection to local document RAG

**Files:**
- Modify: `src/server/deepseek-rag-service.mjs:26-40, 598-656, 955-1194, 1251-1333`
- Test: `tests/deepseek-rag-retriever.test.mjs`
- Test: `tests/deepseek-rag-output-limits.test.mjs`
- Test: `tests/deepseek-rag.test.mjs`

- [ ] **Step 1: Add failing precision and budget cases**

In `tests/deepseek-rag-retriever.test.mjs`, add a fixture-based retriever case using the existing `readMarkdownFile` injection. Include at least these chunks:

```js
const precisionMarkdown = [
  "## Computer Science 计算机科学\n算法、人工智能、软件系统与机器人。",
  "## Mechanical Engineering 机械工程\n机械设计、CAD、控制与机器人。",
  "## Hospitality Management 酒店管理\n酒店运营、旅游与服务管理。",
  "## Archive Studies 档案学\n档案保存、图书馆与历史文献。",
].join("\n\n");
```

Run the dedicated major query with a robotics profile and assert:

```js
assert.ok(result.sources.length <= 9, "Six knowledge plus three personal sources is the hard maximum.");
assert.ok(result.sources.some((source) => /Computer Science|Mechanical Engineering/u.test(source.title)));
assert.ok(result.sources.some((source) => source.scope === "personal"));
assert.ok(result.sources.every((source) => !/Hospitality|Archive Studies/u.test(source.title)));
assert.equal(result.retrieval.relevance.policyVersion, "retrieval-relevance@2026-08-06");
assert.ok(result.retrieval.relevance.rejectedCandidates > 0);
```

Add a knowledge-only unrelated query and assert it returns zero selected sources rather than baselines:

```js
const unrelated = await retriever.retrieve({
  user: { id: "precision-negative" },
  question: "今天北京天气如何？",
  usePersonalContext: false,
});
assert.deepEqual(unrelated.sources, []);
assert.equal(unrelated.retrieval.selectedDocuments, 0);
```

- [ ] **Step 2: Run the retriever test and confirm failure**

Run:

```powershell
node --import tsx tests/deepseek-rag-retriever.test.mjs
```

Expected: current forced baselines and fourteen-result selection violate the new assertions.

- [ ] **Step 3: Introduce compact retrieval queries and stop tokens**

Import the selector in `src/server/deepseek-rag-service.mjs`:

```js
import {
  RETRIEVAL_RELEVANCE_POLICY_VERSION,
  selectRelevantEvidence,
} from "../domain/retrieval-relevance.mjs";
```

Add these constants and helpers near the current retrieval constants:

```js
const KNOWLEDGE_DOCUMENT_LIMIT = 8;
const PERSONALIZED_KNOWLEDGE_DOCUMENT_LIMIT = 6;
const PERSONAL_DOCUMENT_LIMIT = 3;
const RETRIEVAL_STOP_PHRASES = [
  "请根据", "申请档案", "自动匹配", "美国本科", "输出", "核心结论",
  "推荐专业优先级表", "下一步行动",
];
const RETRIEVAL_STOP_TOKENS = new Set(RETRIEVAL_STOP_PHRASES.flatMap(tokenizeRaw));

function tokenizeRaw(value) {
  const text = String(value || "").toLowerCase();
  const asciiTokens = text.match(/[a-z0-9][a-z0-9.+#-]*/g) || [];
  const cjkChars = Array.from(text).filter((char) => /\p{Script=Han}/u.test(char));
  const cjkBigrams = [];
  for (let index = 0; index < cjkChars.length - 1; index += 1) {
    cjkBigrams.push(`${cjkChars[index]}${cjkChars[index + 1]}`);
  }
  return [...new Set([...asciiTokens, ...cjkBigrams])].filter((token) => token.length >= 2);
}

function tokenize(value) {
  return tokenizeRaw(value).filter((token) => !RETRIEVAL_STOP_TOKENS.has(token));
}

function buildMajorMatchRetrievalQuery({ question, profile = {}, portfolio = {} }) {
  const profileData = profile.profile || profile;
  return [
    String(question || "").split("\n")[0],
    profileData.interests,
    profileData.intendedMajor,
    profileData.careerInterests,
    ...(portfolio.activities || []).slice(0, 8).flatMap((activity) => [
      activity.activityName || activity.name,
      activity.description,
      activity.role,
    ]),
    ...(portfolio.competitions || []).slice(0, 5).flatMap((competition) => [
      competition.name,
      competition.category,
    ]),
  ].map(cleanText).filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Replace forced baselines with explicit personal anchors and selected knowledge**

Replace `selectRelevantDocuments` and `ensureBaselineContext` with one selection function:

```js
function selectRelevantDocuments(documents, question, intentProfile, {
  usePersonalContext = false,
} = {}) {
  const queryTokens = tokenize(question);
  const candidates = documents.map((document, index) => {
    const scope = PERSONAL_SOURCE_TYPES.has(getRagDocumentType(document)) ? "personal" : "knowledge";
    const score = scope === "personal"
      ? personalAnchorScore(document)
      : scoreDocument(document, queryTokens, question, intentProfile);
    return {
      id: getRagDocumentId(document),
      type: getRagDocumentType(document),
      scope,
      title: getRagDocumentTitle(document),
      text: getRagDocumentText(document),
      channel: scope === "personal" ? "personal" : "local-keyword",
      rawScore: score,
      index,
    };
  });
  const knowledgeLimit = usePersonalContext
    ? PERSONALIZED_KNOWLEDGE_DOCUMENT_LIMIT
    : KNOWLEDGE_DOCUMENT_LIMIT;
  const selection = selectRelevantEvidence(candidates, {
    maxResults: knowledgeLimit + (usePersonalContext ? PERSONAL_DOCUMENT_LIMIT : 0),
    scopeLimits: {
      knowledge: knowledgeLimit,
      personal: usePersonalContext ? PERSONAL_DOCUMENT_LIMIT : 0,
    },
  });
  return selection;
}

function personalAnchorScore(document) {
  const type = getRagDocumentType(document);
  const title = getRagDocumentTitle(document);
  if (type === "application-portfolio") return 1;
  if (title.includes("基础信息")) return 1;
  if (title.includes("当前方案")) return 0.8;
  return 0.9;
}
```

In `createRagRetriever.retrieve`, build the search question and selection:

```js
const retrievalQuestion = assistantProfile === "major-match"
  ? buildMajorMatchRetrievalQuery({ question: normalizedQuestion, profile, portfolio })
  : normalizedQuestion;
const selection = selectRelevantDocuments(
  documents,
  retrievalQuestion,
  intentProfile,
  { usePersonalContext: includePersonalContext },
);
const contextSelection = buildContextSelection(selection.selected);
```

Return internal selected candidates for the PostgreSQL adapter and safe diagnostics for the API:

```js
return {
  context: contextSelection.context,
  sources: contextSelection.included.map(serializeRagSource),
  candidates: selection.selected,
  retrieval: {
    totalDocuments: documents.length,
    selectedDocuments: contextSelection.included.length,
    intent: intentProfile.intent,
    intentReason: intentProfile.reason,
    sourceWeights: intentProfile.sourceWeights,
    retrievalMs,
    relevance: selection.diagnostics,
  },
  missingFields,
};
```

Do not include `candidates` in `finalizeRagAnswerResponse`; the existing finalizer already returns only `sources`, `missingFields`, `retrieval`, and `quality`.

- [ ] **Step 5: Run local RAG regression tests**

Run:

```powershell
node --import tsx tests/retrieval-relevance.test.mjs
node --import tsx tests/deepseek-rag-retriever.test.mjs
node --import tsx tests/deepseek-rag-output-limits.test.mjs
node --import tsx tests/deepseek-rag.test.mjs
```

Expected: all exit with code `0`; no test expects a full fourteen-source set.

- [ ] **Step 6: Commit local precision retrieval**

```powershell
git add -- src/server/deepseek-rag-service.mjs tests/deepseek-rag-retriever.test.mjs tests/deepseek-rag-output-limits.test.mjs tests/deepseek-rag.test.mjs
git commit -m "feat: filter local rag evidence by relevance"
```

### Task 4: Filter and budget GraphRAG evidence

**Files:**
- Modify: `src/domain/admissions-knowledge-graph.mjs:1-3, 194-315`
- Modify: `src/server/retrieval-orchestrator.mjs:1-145`
- Test: `tests/admissions-knowledge-graph.test.mjs`
- Test: `tests/retrieval-orchestrator.test.mjs`
- Test: `tests/graph-rag-golden-eval.test.mjs`

- [ ] **Step 1: Add failing graph precision assertions**

In `tests/admissions-knowledge-graph.test.mjs`, assert the default fact budget and anchor metadata:

```js
assert.ok(result.facts.length <= 8);
assert.ok(result.facts.every((fact) => fact.queryAnchored === true || fact.evidenceAnchored === true));
```

In `tests/retrieval-orchestrator.test.mjs`, return one anchored high-score fact and one weak unanchored fact:

```js
facts: [
  { id: "fact-1", score: 10, sourceId: "doc-1", queryAnchored: true },
  { id: "fact-noise", score: 1, sourceId: "other", queryAnchored: false, evidenceAnchored: false },
],
```

Assert:

```js
assert.equal(graphResult.retrieval.graph.selectedFacts, 1);
assert.doesNotMatch(graphResult.context, /fact-noise/u);
assert.ok(graphResult.sources.length <= 9);
```

- [ ] **Step 2: Run graph tests and confirm failure**

Run:

```powershell
node --import tsx tests/admissions-knowledge-graph.test.mjs
node --import tsx tests/retrieval-orchestrator.test.mjs
```

Expected: the current sixteen-fact default and unfiltered merge fail.

- [ ] **Step 3: Add graph anchoring metadata and lower the default budget**

In `src/domain/admissions-knowledge-graph.mjs`, change:

```js
const DEFAULT_FACT_LIMIT = 8;
```

Build an evidence-matched entity set next to `queryMatchedEntityIds`:

```js
const evidenceMatchedEntityIds = new Set(scoredEntities
  .filter(({ score, queryScore }) => score > 0 && score > queryScore * 3)
  .map(({ entity }) => entity.id));
```

Add these fields to each ranked fact:

```js
queryAnchored: queryMatchedEntityIds.has(relation.from)
  || queryMatchedEntityIds.has(relation.to),
evidenceAnchored: evidenceMatchedEntityIds.has(relation.from)
  || evidenceMatchedEntityIds.has(relation.to),
```

Before diversity selection, require an anchor:

```js
const anchoredFacts = rankedFacts.filter((fact) => fact.queryAnchored || fact.evidenceAnchored);
const facts = selectDiverseGraphFacts(anchoredFacts, { queryMatchedEntityIds, factLimit });
```

- [ ] **Step 4: Apply the shared score floor during orchestration**

Import `selectRelevantEvidence` and `formatGraphFacts` in `src/server/retrieval-orchestrator.mjs`. Add:

```js
function selectGraphFacts(graphResult = {}, documentResult = {}) {
  const documentSourceIds = new Set((documentResult.sources || []).map((source) => source.id));
  const candidates = (graphResult.facts || [])
    .filter((fact) => fact.queryAnchored
      || fact.evidenceAnchored
      || documentSourceIds.has(fact.sourceId))
    .map((fact) => ({
      ...fact,
      id: fact.id,
      type: "knowledge-graph",
      scope: "knowledge",
      channel: "graph",
      rawScore: Number(fact.score || fact.confidence || 0),
    }));
  return selectRelevantEvidence(candidates, { maxResults: 8 });
}
```

In `mergeGraphAndDocumentRetrieval`, use selected facts to rebuild graph context and retain only graph sources whose ids/source ids support selected facts:

```js
const graphSelection = selectGraphFacts(graphResult, documentResult);
const selectedFacts = graphSelection.selected;
const selectedGraphSourceIds = new Set(selectedFacts.map((fact) => fact.sourceId).filter(Boolean));
const graphSources = (graphResult.sources || []).filter((source) => (
  selectedGraphSourceIds.has(source.id) || selectedGraphSourceIds.has(source.sourceId)
));
const graphContext = formatGraphFacts(selectedFacts).slice(0, maxGraphContextChars);
```

Set `retrieval.graph.selectedFacts` from `selectedFacts.length` and add `retrieval.graph.relevance = graphSelection.diagnostics`.

- [ ] **Step 5: Run graph and golden evaluation tests**

Run:

```powershell
node --import tsx tests/admissions-knowledge-graph.test.mjs
node --import tsx tests/retrieval-orchestrator.test.mjs
node --import tsx tests/graph-rag-golden-eval.test.mjs
npm run eval:graph-rag
```

Expected: all exit with code `0`; the candidate report uses no more than eight selected facts per case.

- [ ] **Step 6: Commit GraphRAG precision controls**

```powershell
git add -- src/domain/admissions-knowledge-graph.mjs src/server/retrieval-orchestrator.mjs tests/admissions-knowledge-graph.test.mjs tests/retrieval-orchestrator.test.mjs tests/graph-rag-golden-eval.test.mjs
git commit -m "feat: filter graph rag evidence by relevance"
```

### Task 5: Unify PostgreSQL and school-selection evidence budgets

**Files:**
- Modify: `src/infrastructure/hybrid-retriever.ts:15-103`
- Modify: `src/infrastructure/postgres-rag-retriever.ts:1-128`
- Modify: `src/server/school-selection-service.mjs:24-30, 1354-1440`
- Test: `tests/hybrid-retrieval-infrastructure.test.mjs`
- Test: `tests/postgres-rag-retriever.test.mjs`
- Test: `tests/school-selection-service.test.mjs`

- [ ] **Step 1: Add failing PostgreSQL competition and reranker-pruning tests**

Replace append-only expectations in `tests/postgres-rag-retriever.test.mjs` with candidates containing scores:

```js
const baselineResult = {
  context: "",
  sources: [],
  candidates: [
    { id: "local-good", type: "major-encyclopedia", scope: "knowledge", channel: "local-keyword", rawScore: 10, title: "Computer Science", text: "Algorithms and AI" },
    { id: "local-noise", type: "major-encyclopedia", scope: "knowledge", channel: "local-keyword", rawScore: 1, title: "Hospitality", text: "Hotel operations" },
  ],
  retrieval: { selectedDocuments: 2 },
};
const postgresResults = [
  { id: "pg-good", sourceType: "major-encyclopedia", title: "Mechanical Engineering", content: "Robotics and CAD", score: 0.04 },
  { id: "pg-noise", sourceType: "resource-library", title: "Archive Studies", content: "Library records", score: 0.01 },
];
const merged = mergePostgresRetrieval({ baselineResult, postgresResults, maxSources: 8 });
assert.deepEqual(merged.sources.map((source) => source.id), ["local-good", "pg-good"]);
assert.equal(merged.retrieval.selectedDocuments, 2);
assert.ok(merged.retrieval.relevance.rejectedCandidates >= 2);
```

In `tests/hybrid-retrieval-infrastructure.test.mjs`, add a reranker that deliberately returns one result and assert the retriever accepts it:

```js
const pruned = await createHybridRetriever({
  keywordSearch: async () => [{ id: "one" }, { id: "two" }],
  vectorSearch: async () => [{ id: "one" }, { id: "two" }],
  rerank: async () => [{ id: "one", score: 0.9 }],
}).search("focused", { limit: 8 });
assert.deepEqual(pruned.results.map((item) => item.id), ["one"]);
assert.equal(pruned.retrieval.reranker, "applied");
```

- [ ] **Step 2: Run infrastructure tests and confirm failure**

Run:

```powershell
node --import tsx tests/postgres-rag-retriever.test.mjs
node --import tsx tests/hybrid-retrieval-infrastructure.test.mjs
```

Expected: append-only merging and the “too few reranked results” guard fail the new assertions.

- [ ] **Step 3: Permit high-quality reranker pruning**

In both reranker branches of `src/infrastructure/hybrid-retriever.ts`, replace the length guard with:

```ts
if (!Array.isArray(reranked)) throw new Error("Reranker returned a non-array result.");
```

Return `reranked.slice(0, limit)` even when it contains fewer than `limit` results.

- [ ] **Step 4: Make PostgreSQL candidates compete under one selector**

Import `selectRelevantEvidence` plus `buildContextSelection` and `serializeRagSource`. Replace `mergePostgresRetrieval` with:

```ts
export function mergePostgresRetrieval({
  baselineResult,
  postgresResults,
  maxSources = 8,
  maxContextChars = 18_000,
}: any) {
  const baselineCandidates = Array.isArray(baselineResult.candidates)
    ? baselineResult.candidates
    : (baselineResult.sources || []).map((source: any, index: number) => ({
        id: source.id,
        type: source.type,
        scope: source.scope || "knowledge",
        title: source.title,
        text: source.snippet || "",
        channel: "local-keyword",
        rawScore: Math.max(1, (baselineResult.sources || []).length - index),
      }));
  const postgresCandidates = (postgresResults || []).map((source: any, index: number) => ({
    id: source.id,
    type: source.sourceType,
    scope: "knowledge",
    title: source.title,
    text: String(source.content || "").trim(),
    channel: "postgres-hybrid",
    rawScore: Number(source.score) > 0 ? Number(source.score) : 1 / (index + 1),
    metadata: source,
  }));
  const selection = selectRelevantEvidence(
    [...baselineCandidates, ...postgresCandidates],
    { maxResults: maxSources, scopeLimits: { knowledge: maxSources, personal: 3 } },
  );
  const contextSelection = buildContextSelection(selection.selected, maxContextChars);
  return {
    ...baselineResult,
    context: contextSelection.context,
    candidates: selection.selected,
    sources: contextSelection.included.map(serializeRagSource),
    retrieval: {
      ...baselineResult.retrieval,
      postgresDocuments: postgresResults.length,
      postgresSelectedDocuments: selection.selected.filter((item: any) => item.channel === "postgres-hybrid").length,
      selectedDocuments: contextSelection.included.length,
      relevance: selection.diagnostics,
    },
  };
}
```

Update the caller to use `maxSources: 8`; remove the append-only PostgreSQL context separator and its separate eight-source allowance.

- [ ] **Step 5: Apply the selector to school-selection documents**

Import `selectRelevantEvidence` in `src/server/school-selection-service.mjs`. In `buildSchoolSelectionRagSources`, map scored documents to candidates and return only selected evidence:

```js
const candidates = documents.map((document, index) => ({
  ...document,
  scope: "knowledge",
  channel: "school-keyword",
  rawScore: scoreRagDocument(document, tokens),
  index,
}));
return selectRelevantEvidence(candidates, { maxResults: MAX_RAG_SOURCES }).selected;
```

Add this test to `tests/school-selection-service.test.mjs` using its existing captured `ragSources`:

```js
assert.ok(generated.ragSources.filter((source) => source.type === "school-encyclopedia").length <= 8);
assert.ok(generated.retrieval.graph.selectedFacts <= 8);
```

- [ ] **Step 6: Run infrastructure and school-selection tests**

Run:

```powershell
node --import tsx tests/retrieval-relevance.test.mjs
node --import tsx tests/hybrid-retrieval-infrastructure.test.mjs
node --import tsx tests/postgres-rag-retriever.test.mjs
node --import tsx tests/school-selection-service.test.mjs
node --import tsx tests/server-school-selection.test.mjs
```

Expected: all exit with code `0`; local plus PostgreSQL results never exceed the shared budget.

- [ ] **Step 7: Commit infrastructure budget unification**

```powershell
git add -- src/infrastructure/hybrid-retriever.ts src/infrastructure/postgres-rag-retriever.ts src/server/school-selection-service.mjs tests/hybrid-retrieval-infrastructure.test.mjs tests/postgres-rag-retriever.test.mjs tests/school-selection-service.test.mjs
git commit -m "feat: unify rag evidence budgets"
```

### Task 6: Separate limited evidence, human review, and actual model fallback

**Files:**
- Modify: `src/server/ai-quality.mjs:18-23, 68-123, 197-207`
- Modify: `src/server/deepseek-rag-service.mjs:321-385, 452-476`
- Modify: `src/server/langgraph-rag-workflow.mjs:4-20, 113-130`
- Modify: `src/client/ask-deepseek.js:98-104, 516-544`
- Modify: `styles.css` quality-review state styles
- Modify: `ask-deepseek.html` browser-module query
- Test: `tests/ai-quality.test.mjs`
- Test: `tests/langgraph-rag-workflow.test.mjs`
- Test: `tests/deepseek-rag.test.mjs`
- Test: `tests/ask-deepseek-page.test.mjs`

- [ ] **Step 1: Add failing quality-state tests**

In `tests/ai-quality.test.mjs`, add:

```js
const limitedQuality = evaluateAiAnswerQuality({
  answer: "目前资料不足，建议先补充活动描述。",
  sources: [],
  expectedSourceTypes: [["application-portfolio", "student-backup"]],
});
assert.equal(limitedQuality.status, "limited_evidence");
assert.equal(limitedQuality.review.required, false);
assert.equal(limitedQuality.review.fallback.triggered, false);
assert.ok(limitedQuality.review.reasons.includes("no_sources"));

assert.equal(riskyQuality.status, "review_required");
assert.equal(riskyQuality.review.required, true);
assert.equal(quality.status, "pass");
```

In `tests/langgraph-rag-workflow.test.mjs`, make `draftAnswer` return:

```js
{
  answer: "answer",
  selectedModel: "deepseek-v4-flash",
  outputDiagnostics: {},
}
```

Assert `evaluateQuality` receives `selectedModel`.

- [ ] **Step 2: Add failing UI-state assertions**

In `tests/ask-deepseek-page.test.mjs`, assert:

```js
assert.ok(script.includes('limited_evidence: "可核验资料不足"'));
assert.ok(script.includes('review_required: "需要人工复核"'));
assert.ok(script.includes('pass: "质量检查通过"'));
assert.ok(script.includes("quality.status"));
assert.ok(styles.includes(".chat-quality-review.limited-evidence"));
```

- [ ] **Step 3: Run quality, graph, and page tests and confirm failure**

Run:

```powershell
node --import tsx tests/ai-quality.test.mjs
node --import tsx tests/langgraph-rag-workflow.test.mjs
node --import tsx tests/ask-deepseek-page.test.mjs
```

Expected: current quality objects lack `status` and graph state drops `selectedModel`.

- [ ] **Step 4: Classify evidence and review reasons separately**

In `evaluateAiAnswerQuality`, split reason sets:

```js
const evidenceReasons = [
  normalizedSources.length ? "" : "no_sources",
  retrievalHitRate < hitRateThreshold ? "low_retrieval_hit_rate" : "",
].filter(Boolean);
const reviewReasons = [
  unsupportedCitations.length ? "unsupported_citations" : "",
  highRiskClaims.length ? "high_risk_claims" : "",
  output.truncated || output.finishReason === "length" ? "response_too_long" : "",
].filter(Boolean);
const status = reviewReasons.length
  ? "review_required"
  : evidenceReasons.length
    ? "limited_evidence"
    : "pass";
```

Return `status` and build review state with all reasons plus explicit status:

```js
review: buildReviewState([...evidenceReasons, ...reviewReasons], status),
```

Replace `buildReviewState` with:

```js
function buildReviewState(reasons, status = "pass") {
  const uniqueReasons = uniqueStrings(reasons);
  const required = status === "review_required";
  return {
    required,
    reasons: uniqueReasons,
    fallback: {
      triggered: required,
      message: required ? AI_REVIEW_FALLBACK_MESSAGE : "",
    },
  };
}
```

Set `status: "pass"` in `buildAiRequestQuality`.

- [ ] **Step 5: Propagate the actual selected model through LangGraph**

In `draftDeepSeekRagAnswer`, return:

```js
return {
  answer: boundedAnswer.answer,
  selectedModel: String(llmResult?.model || model || ""),
  outputDiagnostics: {
    originalCharacters: rawAnswer.length,
    returnedCharacters: boundedAnswer.answer.length,
    maxCharacters: outputLimits.maxAnswerChars,
    maxTokens: outputLimits.maxTokens,
    truncated: boundedAnswer.truncated,
    finishReason,
  },
};
```

Add `selectedModel: Annotation()` to `RagAnswerState`. Replace `normalizeDraftAnswer` with:

```js
function normalizeDraftAnswer(result) {
  if (result && typeof result === "object" && Object.hasOwn(result, "answer")) {
    return {
      answer: String(result.answer || ""),
      selectedModel: String(result.selectedModel || ""),
      outputDiagnostics: result.outputDiagnostics || {},
    };
  }
  return { answer: String(result || ""), selectedModel: "", outputDiagnostics: {} };
}
```

In `evaluateRagGraphQuality`, include:

```js
extraMetadata: {
  workflowVersion,
  requestedModel: model,
  selectedModel: selectedModel || model,
  modelFallbackTriggered: Boolean(selectedModel && model && selectedModel !== model),
},
```

- [ ] **Step 6: Render targeted quality states**

In `src/client/ask-deepseek.js`, add:

```js
const QUALITY_STATUS_LABELS = {
  limited_evidence: "可核验资料不足",
  review_required: "需要人工复核",
  pass: "质量检查通过",
};
```

In `renderQualityReview`, derive:

```js
const qualityStatus = String(quality.status || (review.required ? "review_required" : "pass"));
const requiresReview = qualityStatus === "review_required";
const limitedEvidence = qualityStatus === "limited_evidence";
const label = QUALITY_STATUS_LABELS[qualityStatus] || QUALITY_STATUS_LABELS.pass;
const message = requiresReview
  ? review.fallback?.message || "当前回答需要人工复核，请先核验参考资料后再用于申请决策。"
  : limitedEvidence
    ? "当前可核验资料不足，回答已限制在现有证据范围内；可补充资料后重试。"
    : "质量检查通过，仍建议展开参考资料核验关键事实。";
```

Use `label` in the heading and add `limited-evidence` as a class when applicable. Add `.chat-quality-review.limited-evidence` to `styles.css` with a neutral informational treatment distinct from the error/review-required state. Update the cache-busting query for `ask-deepseek.js` in `ask-deepseek.html`.

- [ ] **Step 7: Re-run quality and UI tests**

Run:

```powershell
node --import tsx tests/ai-quality.test.mjs
node --import tsx tests/langgraph-rag-workflow.test.mjs
node --import tsx tests/deepseek-rag.test.mjs
node --import tsx tests/ask-deepseek-page.test.mjs
```

Expected: all exit with code `0`; missing evidence is not presented as a model/system fallback.

- [ ] **Step 8: Commit quality-state and model diagnostics**

```powershell
git add -- src/server/ai-quality.mjs src/server/deepseek-rag-service.mjs src/server/langgraph-rag-workflow.mjs src/client/ask-deepseek.js styles.css ask-deepseek.html tests/ai-quality.test.mjs tests/langgraph-rag-workflow.test.mjs tests/deepseek-rag.test.mjs tests/ask-deepseek-page.test.mjs
git commit -m "feat: distinguish rag evidence and review states"
```

### Task 7: Add a runtime relevance quality gate

**Files:**
- Create: `src/infrastructure/rag-relevance-golden-eval.ts`
- Create: `tests/fixtures/rag-relevance-golden.json`
- Create: `tests/rag-relevance-golden-eval.test.mjs`
- Create: `scripts/evaluate-rag-relevance-golden.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing evaluator test**

Create `tests/rag-relevance-golden-eval.test.mjs`:

```js
import assert from "node:assert/strict";
import { evaluateRagRelevanceGoldenSet } from "../src/infrastructure/rag-relevance-golden-eval.ts";

const report = await evaluateRagRelevanceGoldenSet({
  cases: [
    {
      id: "positive",
      category: "major",
      usePersonalContext: true,
      relevantPatterns: ["Computer Science"],
      forbiddenPatterns: ["Hospitality"],
      maxSources: 2,
    },
    {
      id: "negative",
      category: "negative",
      relevantPatterns: [],
      forbiddenPatterns: ["Anything"],
      maxSources: 0,
    },
  ],
  retrieve: async (item) => item.id === "positive"
    ? {
        sources: [
          { id: "cs", title: "Computer Science", scope: "knowledge" },
          { id: "portfolio", title: "Application portfolio", scope: "personal" },
        ],
        retrieval: { graph: { selectedFacts: 0 } },
      }
    : { sources: [], retrieval: { graph: { selectedFacts: 0 } } },
  precisionFloor: 0.8,
  categoryPrecisionFloor: 0.7,
  recallFloor: 1,
  latencyAllowance: { ratio: 1.15, absoluteMs: 50 },
  maxLatencyMs: 2_000,
});

assert.equal(report.ok, true);
assert.equal(report.summary.precisionAtK, 1);
assert.equal(report.summary.recallAtK, 1);
assert.equal(report.summary.noiseRate, 0);
assert.equal(report.details[0].relevantSources, 2);
assert.equal(report.absoluteLatencyPassed, true);
assert.equal(report.details[1].sourceBudgetPassed, true);
```

- [ ] **Step 2: Run the evaluator test and confirm failure**

Run:

```powershell
node --import tsx tests/rag-relevance-golden-eval.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `rag-relevance-golden-eval.ts`.

- [ ] **Step 3: Implement the runtime evaluator**

Create `src/infrastructure/rag-relevance-golden-eval.ts` with this interface and calculations:

```ts
import { performance } from "node:perf_hooks";

export async function evaluateRagRelevanceGoldenSet({
  cases,
  retrieve,
  baselineRetrieve = null,
  precisionFloor = 0.8,
  categoryPrecisionFloor = 0.7,
  recallFloor = 1,
  latencyAllowance = { ratio: 1.15, absoluteMs: 50 },
  maxLatencyMs = 2_000,
}: any) {
  const details = [];
  for (const item of cases) {
    const baseline = baselineRetrieve ? await measure(() => baselineRetrieve(item)) : null;
    const candidate = await measure(() => retrieve(item));
    details.push(buildDetail(item, baseline, candidate, maxLatencyMs));
  }
  const summary = summarize(details);
  const categories = Object.fromEntries([...new Set(details.map((item) => item.category))].map((category) => [
    category,
    summarize(details.filter((item) => item.category === category)),
  ]));
  const latencyPassed = details.every((detail) => !detail.baselineLatencyMs
    || detail.candidateLatencyMs <= Math.max(
      detail.baselineLatencyMs * latencyAllowance.ratio,
      detail.baselineLatencyMs + latencyAllowance.absoluteMs,
    ));
  const absoluteLatencyPassed = details.every((detail) => detail.absoluteLatencyPassed);
  const ok = summary.precisionAtK >= precisionFloor
    && summary.recallAtK >= recallFloor
    && Object.values(categories).every((group: any) => group.precisionAtK >= categoryPrecisionFloor)
    && details.every((detail) => detail.forbiddenPassed && detail.sourceBudgetPassed && detail.graphBudgetPassed)
    && latencyPassed
    && absoluteLatencyPassed;
  return { ok, summary, categories, latencyPassed, absoluteLatencyPassed, details };
}

async function measure(operation: () => Promise<any>) {
  const startedAt = performance.now();
  const result = await operation();
  return { result, latencyMs: performance.now() - startedAt };
}

function buildDetail(item: any, baseline: any, candidate: any, maxLatencyMs: number) {
  const sources = candidate.result.sources || [];
  const relevantPatterns = item.relevantPatterns || [];
  const relevant = sources.filter((source: any) => (
    matchesAny(source, relevantPatterns)
    || (item.usePersonalContext === true && source.scope === "personal")
  ));
  const forbidden = sources.filter((source: any) => matchesAny(source, item.forbiddenPatterns));
  const matchedRelevantPatterns = relevantPatterns.filter((pattern: string) => (
    sources.some((source: any) => matchesPattern(source, pattern))
  )).length;
  const expectedCount = relevantPatterns.length;
  return {
    id: item.id,
    category: item.category || "uncategorized",
    selectedSources: sources.length,
    relevantSources: relevant.length,
    precision: sources.length ? relevant.length / sources.length : expectedCount ? 0 : 1,
    recall: expectedCount ? matchedRelevantPatterns / expectedCount : 1,
    forbiddenPassed: forbidden.length === 0,
    sourceBudgetPassed: sources.length <= Number(item.maxSources ?? 8),
    graphBudgetPassed: Number(candidate.result.retrieval?.graph?.selectedFacts || 0) <= Number(item.maxGraphFacts ?? 8),
    baselineLatencyMs: baseline?.latencyMs || 0,
    candidateLatencyMs: candidate.latencyMs,
    absoluteLatencyPassed: candidate.latencyMs <= Number(item.maxLatencyMs ?? maxLatencyMs),
  };
}

function matchesAny(source: any, patterns: string[] = []) {
  return patterns.some((pattern) => matchesPattern(source, pattern));
}

function matchesPattern(source: any, pattern: string) {
  const text = `${source.id || ""}\n${source.title || ""}\n${source.type || ""}`;
  return new RegExp(pattern, "iu").test(text);
}

function summarize(details: any[]) {
  const count = Math.max(1, details.length);
  const precisionAtK = details.reduce((sum, item) => sum + item.precision, 0) / count;
  const recallAtK = details.reduce((sum, item) => sum + item.recall, 0) / count;
  return {
    cases: details.length,
    precisionAtK: round(precisionAtK),
    recallAtK: round(recallAtK),
    noiseRate: round(1 - precisionAtK),
  };
}

function round(value: number) { return Number(value.toFixed(6)); }
```

- [ ] **Step 4: Add the actual runtime fixture**

Create `tests/fixtures/rag-relevance-golden.json` with these exact initial cases:

```json
[
  {
    "id": "zh-major-robotics",
    "category": "major",
    "query": "根据我的机器人、AI 和编程项目匹配适合的本科专业",
    "assistantProfile": "major-match",
    "usePersonalContext": true,
    "profile": { "profile": { "interests": "机器人、人工智能、编程", "intendedMajor": "Computer Science" } },
    "portfolio": { "activities": [{ "activityName": "Robotics Outreach", "description": "开发导航机器人并教授编程" }] },
    "relevantPatterns": ["Computer Science|Mechanical Engineering"],
    "forbiddenPatterns": ["Hospitality|Tourism|Archive / Library|Insurance"],
    "maxSources": 9,
    "maxGraphFacts": 8
  },
  {
    "id": "en-major-humanities",
    "category": "major",
    "query": "Match majors for archival history research and public writing",
    "assistantProfile": "major-match",
    "usePersonalContext": true,
    "profile": { "profile": { "interests": "history, archival research, public writing" } },
    "portfolio": { "activities": [{ "activityName": "Local History Archive", "description": "Catalogued oral histories and published essays" }] },
    "relevantPatterns": ["History|Archive|Political Science|Public Policy"],
    "forbiddenPatterns": ["Hospitality|Tourism|Insurance"],
    "maxSources": 9,
    "maxGraphFacts": 8
  },
  {
    "id": "zh-school-mit-recommendation",
    "category": "school",
    "query": "MIT 的推荐信要求是什么？",
    "usePersonalContext": false,
    "relevantPatterns": ["麻省理工|MIT"],
    "forbiddenPatterns": ["普林斯顿|哈佛|斯坦福|耶鲁|西北"],
    "maxSources": 4,
    "maxGraphFacts": 0
  },
  {
    "id": "zh-resource-cs-competition",
    "category": "resource",
    "query": "适合计算机学生的竞赛",
    "usePersonalContext": false,
    "relevantPatterns": ["竞赛|计算机|信息学|算法"],
    "forbiddenPatterns": ["酒店|旅游|档案学"],
    "maxSources": 8,
    "maxGraphFacts": 8
  },
  {
    "id": "en-academic-ap-cs",
    "category": "academic",
    "query": "What does AP Computer Science A cover?",
    "usePersonalContext": false,
    "relevantPatterns": ["AP|Computer Science"],
    "forbiddenPatterns": ["Hospitality|Tourism|Archive"],
    "maxSources": 8,
    "maxGraphFacts": 0
  },
  {
    "id": "zh-profile-without-consent",
    "category": "negative",
    "query": "请分析我的申请档案优势和短板",
    "usePersonalContext": false,
    "relevantPatterns": [],
    "forbiddenPatterns": ["Business Analytics|Archive / Library|Hospitality|Tourism"],
    "maxSources": 0,
    "maxGraphFacts": 0
  },
  {
    "id": "zh-unrelated-weather",
    "category": "negative",
    "query": "今天北京天气如何？",
    "usePersonalContext": false,
    "relevantPatterns": [],
    "forbiddenPatterns": ["."],
    "maxSources": 0,
    "maxGraphFacts": 0
  }
]
```

- [ ] **Step 5: Add the runtime script and package gate**

Create `scripts/evaluate-rag-relevance-golden.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRagRetriever } from "../src/server/deepseek-rag-service.mjs";
import { createStaticAdmissionsKnowledgeGraphAdapter } from "../src/server/admissions-knowledge-graph-adapter.mjs";
import { createRetrievalOrchestrator } from "../src/server/retrieval-orchestrator.mjs";
import { evaluateRagRelevanceGoldenSet } from "../src/infrastructure/rag-relevance-golden-eval.ts";

const cases = JSON.parse(await readFile(new URL("../tests/fixtures/rag-relevance-golden.json", import.meta.url), "utf8"));
const planning = {
  async getProfile(user) { return user.profile || {}; },
  async getLatestRagPlan() { return null; },
};
const activityPortfolio = {
  async getPortfolio(user) { return user.portfolio || {}; },
};
const documentRetriever = createRagRetriever({ root: process.cwd(), planning, activityPortfolio });
const graph = createStaticAdmissionsKnowledgeGraphAdapter({ root: process.cwd(), planning, activityPortfolio });
const orchestrator = createRetrievalOrchestrator({ documentRetriever, knowledgeGraph: graph });

const report = await evaluateRagRelevanceGoldenSet({
  cases,
  maxLatencyMs: 2_000,
  retrieve: (item) => orchestrator.retrieve({
    user: { id: `rag-relevance:${item.id}`, profile: item.profile || {}, portfolio: item.portfolio || {} },
    question: item.query,
    assistantProfile: item.assistantProfile || "",
    usePersonalContext: item.usePersonalContext === true,
  }),
});

const failures = report.details.filter((item) => (
  !item.forbiddenPassed
  || !item.sourceBudgetPassed
  || !item.graphBudgetPassed
  || !item.absoluteLatencyPassed
));
console.log(JSON.stringify({
  ok: report.ok,
  summary: report.summary,
  categories: report.categories,
  latencyPassed: report.latencyPassed,
  absoluteLatencyPassed: report.absoluteLatencyPassed,
  failures,
}, null, 2));
if (!report.ok) process.exitCode = 1;
```

Add to `package.json`:

```json
"eval:rag-relevance": "node --import tsx scripts/evaluate-rag-relevance-golden.mjs"
```

Append `&& npm run eval:rag-relevance` to the existing `verify` script.

- [ ] **Step 6: Run evaluator tests and the real gate**

Run:

```powershell
node --import tsx tests/rag-relevance-golden-eval.test.mjs
npm run eval:rag-relevance
npm run eval:retrieval
npm run eval:graph-rag
```

Expected: all exit with code `0`; the relevance report shows overall Precision@K at least `0.80`, Recall@K `1.00`, zero forbidden-source failures, and no budget failure.

- [ ] **Step 7: Commit the runtime quality gate**

```powershell
git add -- src/infrastructure/rag-relevance-golden-eval.ts tests/fixtures/rag-relevance-golden.json tests/rag-relevance-golden-eval.test.mjs scripts/evaluate-rag-relevance-golden.mjs package.json
git commit -m "test: gate rag relevance and noise"
```

### Task 8: Full verification, browser smoke test, and completion audit

**Files:**
- Modify only files required by failures found in this task.
- Review: `docs/superpowers/specs/2026-08-06-rag-relevance-quality-design.md`
- Review: all files changed by Tasks 1–7.

- [ ] **Step 1: Run syntax, types, contracts, and focused tests**

Run:

```powershell
npm run check
npm run typecheck
npm run contracts:check
node --import tsx tests/retrieval-relevance.test.mjs
node --import tsx tests/ai-quality.test.mjs
node --import tsx tests/deepseek-rag-retriever.test.mjs
node --import tsx tests/retrieval-orchestrator.test.mjs
node --import tsx tests/postgres-rag-retriever.test.mjs
node --import tsx tests/school-selection-service.test.mjs
node --import tsx tests/major-encyclopedia-layout.test.mjs
node --import tsx tests/ask-deepseek-page.test.mjs
node --import tsx tests/rag-relevance-golden-eval.test.mjs
```

Expected: every command exits with code `0`.

- [ ] **Step 2: Run the full repository verification**

Run:

```powershell
npm run verify
```

Expected: syntax, types/contracts, all tests, legacy retrieval evaluation, GraphRAG evaluation, and the new runtime relevance gate pass.

- [ ] **Step 3: Run an explicit privacy and secret audit**

Run:

```powershell
rg -n "usePersonalContext|assistantProfile.*major-match|candidates|selectedModel|modelFallbackTriggered" server.mjs src tests
rg -n "profile|portfolio|snippet|content" src/server/observability.mjs src/server/production-observability.ts src/infrastructure/rag-relevance-golden-eval.ts
$secretMatches = @(git diff HEAD~7 -- . ':!package-lock.json' | rg -n "DEEPSEEK_API_KEY=|sk-[A-Za-z0-9]|postgres(?:ql)?://|smtp.*password")
$secretScanExit = $LASTEXITCODE
if ($secretScanExit -eq 0) { $secretMatches; throw "Potential secret found in the implementation diff." }
if ($secretScanExit -gt 1) { throw "Secret scan failed with exit code $secretScanExit." }
git diff --check
```

Expected:

- major matching is forced to personal context at browser and server boundaries;
- raw candidates never appear in the HTTP response or logs;
- no API key, database URL, SMTP secret, `.env` content, profile content, or source snippet is logged;
- `git diff --check` exits with code `0`.

- [ ] **Step 4: Start a bounded local server for browser verification**

Use an unused explicit port and one hidden background process:

```powershell
$ragSmokePort = 4186
$previousRagSmokePort = $env:PORT
try {
  $env:PORT = "$ragSmokePort"
  $ragSmokeProcess = Start-Process -WindowStyle Hidden -FilePath node -ArgumentList '--import','tsx','server.mjs' -WorkingDirectory (Get-Location) -PassThru
} finally {
  if ($null -eq $previousRagSmokePort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue }
  else { $env:PORT = $previousRagSmokePort }
}
```

Before starting, confirm port `4186` is unused. Poll `http://127.0.0.1:4186/healthz` for no more than 20 seconds. Record `$ragSmokeProcess.Id`. Do not start another server if the port is occupied.

- [ ] **Step 5: Smoke-test desktop and mobile UI states**

At approximately `1280px` and `390px` widths, verify with the existing browser-testing workflow:

- `ask-deepseek.html` loads without console-breaking errors;
- personal-context control remains visible and defaults off;
- knowledge-only quality UI can display “可核验资料不足” without an error style;
- review-required UI displays “需要人工复核” distinctly;
- major encyclopedia action remains visible and submits a request containing `usePersonalContext: true`;
- answer cards, references, input, and buttons do not overlap or overflow;
- navigation remains usable at both widths.

After the smoke test, stop only the recorded process:

```powershell
if ($ragSmokeProcess -and -not $ragSmokeProcess.HasExited) { Stop-Process -Id $ragSmokeProcess.Id }
```

Confirm port `4186` is no longer listening. Never bulk-kill Node processes.

- [ ] **Step 6: Audit every approved requirement against evidence**

Create a local checklist in the task notes and prove each item using the indicated evidence:

```text
Major matching personal context       -> client test + server integration test
Knowledge-only false fallback removed -> AI quality test + RAG integration test
Document maximum <= 8                 -> selector/retriever tests + runtime evaluator
Personal maximum <= 3                 -> selector/retriever tests
Graph facts maximum <= 8              -> graph tests + GraphRAG evaluator
No forced unrelated baselines         -> negative runtime cases
Precision >= 0.80                     -> eval:rag-relevance summary
Recall remains 1.00                   -> eval:retrieval summary
No forbidden sources                  -> eval:rag-relevance failures=[]
Latency gate passes                   -> eval:rag-relevance latencyPassed=true and absoluteLatencyPassed=true
Privacy preserved                     -> service tests + manual diff/search audit
Desktop/mobile UI safe                -> browser smoke evidence
```

Do not declare completion if any row lacks direct evidence.

- [ ] **Step 7: Route any correction back to its owning task**

If verification exposes a code or test defect, stop Task 8 and return to the Task 1-7 section that owns the affected files. Apply the correction there, run that task's explicit targeted tests, use that task's explicit staging/commit command, and then restart Task 8 from Step 1. Do not create an ad hoc verification commit or an empty commit.

- [ ] **Step 8: Confirm final repository state**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected: the worktree contains no unintended changes, and the task commits are visible in order.
