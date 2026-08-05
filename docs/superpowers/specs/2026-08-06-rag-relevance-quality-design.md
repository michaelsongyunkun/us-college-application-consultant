# RAG Relevance and Quality Governance Design

## Status

Approved direction: precision-first retrieval, with explicit evidence limits and honest insufficient-evidence responses.

## Problem Statement

The application robot, automatic major matching, and school selection can retrieve many sources that are only weakly related to the user's question. The current system then treats source-type coverage as a proxy for answer quality, which creates two product failures:

1. Automatic major matching does not send `usePersonalContext: true`, even though the feature promises to use the student's application profile. Its quality check therefore sees only half of the expected source types and marks the answer for fallback review.
2. Knowledge-only application-robot questions intentionally omit personal context, but the quality evaluator still expects personal source types and marks otherwise valid answers as degraded.

Retrieval quality is also too broad. The local retriever accepts every document with a positive token score, fills up to fourteen document slots, and injects baseline source types even when they are unrelated. GraphRAG can add sixteen facts, and the PostgreSQL path can append another eight results. Existing evaluations reward finding the expected source but do not penalize unrelated extra context.

## Product Goal

Return a smaller, more relevant, auditable evidence set; make quality warnings reflect the request the user actually made; and prove the new behavior improves precision without reducing the current expected-source recall.

The product must prefer an explicit “insufficient evidence” state over filling the context with weakly related sources.

## Success Criteria

- Automatic major matching always uses the current profile, application portfolio, and latest current plan, and no longer receives a deterministic low-coverage fallback warning.
- Application-robot questions with personal context disabled are evaluated only against knowledge sources that are appropriate for the detected intent.
- Representative application, major, resource, school, and academic queries achieve at least `0.80` Precision@K on a runtime-level golden set.
- Existing expected-source Recall@5 remains `1.00`; a change that lowers it fails verification.
- Knowledge document selection returns at most eight sources and may return fewer or zero.
- Graph retrieval returns at most eight filtered facts and may return fewer or zero.
- Negative or unrelated queries do not receive a full evidence set.
- The p95 local retrieval latency does not regress by more than 15 percent or 50 milliseconds, whichever allowance is larger.
- Existing personal-data consent boundaries remain intact: free-form application-robot questions use personal data only when the user enables the existing control.

## Non-Goals

- Do not modify `prompts/us-college-admissions-strategist-agent.md`.
- Do not rewrite or delete `data/*.md`.
- Do not introduce a new required embedding or reranker provider.
- Do not redesign the application-robot, major encyclopedia, or school-selection pages.
- Do not change the inspiration robot, which remains a direct non-RAG conversation flow.
- Do not remove historical plan snapshots from the planning product; they remain outside application-robot RAG.

## Chosen Approach

Use a deterministic precision layer shared by local documents, PostgreSQL hybrid retrieval, and graph evidence. Candidate generation remains provider-specific, but every candidate is normalized, filtered, budgeted, and measured before it reaches the model.

This approach is preferred over a small cap-only patch because caps can still preserve the wrong sources. It is preferred over a reranker-only solution because local operation and tests must remain deterministic when embeddings or reranking are unavailable.

## Architecture

### 1. Request policy

The request determines both retrieval scope and quality expectations.

- Free-form application-robot questions preserve the existing `usePersonalContext` control.
- Application workflows continue to enable personal context before submission.
- Automatic major matching always sends `usePersonalContext: true`; clicking the dedicated action is explicit intent to use the student's saved application data.
- School selection continues to use the portfolio provided by its existing service boundary.
- Inspiration requests remain `direct` and bypass all retrieval logic.

The server remains authoritative. A `major-match` request normalizes personal context to `true` even if an older client omits the field, so browser/server drift cannot recreate the bug.

### 2. Internal evidence candidate contract

Document and infrastructure retrievers expose an internal candidate list before formatting context:

```js
{
  id,
  type,
  scope,              // "knowledge" or "personal"
  title,
  text,
  rawScore,
  normalizedScore,    // 0..1 within its retrieval channel
  channel,            // local-keyword, postgres-keyword, postgres-vector, reranker, graph
  metadata,
}
```

The public `retrieve()` result remains compatible: `context`, `sources`, `missingFields`, and `retrieval` are still returned. The candidate contract is internal and must not expose private text through logs or analytics.

### 3. Deterministic relevance selection

Create a pure relevance-selection module under `src/domain/` so the same policy can be exercised without a database, browser, or model call.

For each retrieval channel:

1. Discard non-positive and malformed scores.
2. Normalize valid scores by the highest score in that channel.
3. Keep candidates with `normalizedScore >= 0.55`.
4. If the top two scores have a large drop, keep the higher cluster and stop at the drop; a large drop is a decrease of at least `0.25` normalized points.
5. Deduplicate by stable source id before applying budgets.
6. Sort by normalized relevance, then intent-specific source weight, then stable id.

The selector may return zero results. Source diversity is a tie-breaker and budget rule, not a reason to include a low-relevance candidate.

Personal evidence is handled separately:

- When personal context is disabled, personal candidates are never constructed or selected.
- When enabled, the current profile and application portfolio are grounding anchors and may use up to two personal slots.
- The latest current plan may use one additional personal slot when it contains meaningful data.
- Historical plan snapshots never enter the candidate set.

### 4. Evidence budgets

Budgets are hard maximums, not targets:

| Flow | Knowledge documents | Personal documents | Graph facts | Combined context characters |
| --- | ---: | ---: | ---: | ---: |
| Application robot, knowledge only | 8 | 0 | 6 | 18,000 |
| Application robot, personalized | 6 | 3 | 6 | 20,000 |
| Automatic major matching | 6 | 3 | 8 | 22,000 |
| School selection | 8 | existing portfolio object | 8 | 22,000 |

The context builder orders selected personal grounding first when enabled, then the highest-relevance knowledge evidence, then graph facts. It never adds a source merely to represent every source type.

### 5. Local document retrieval

Remove unconditional school, resource, and major baselines from `ensureBaselineContext`. Personal grounding is selected only under the explicit rules above.

The existing token scorer remains as the deterministic local candidate generator, but generic query boilerplate must not dominate scoring. Dedicated major matching should retrieve using a compact search query derived from student interests, activities, academic evidence, intended directions, and the task type—not the full output-format prompt.

The scorer continues to support Chinese bigrams and ASCII tokens, but it must ignore a small explicit stop-list of product boilerplate such as “请根据”, “申请档案”, “自动匹配”, “美国本科”, “输出”, and report headings. The stop-list applies only to retrieval scoring; it does not alter the user's prompt sent to the model.

### 6. PostgreSQL hybrid retrieval

PostgreSQL results must compete with local candidates instead of being appended after a prebuilt fourteen-document context.

- Keyword and vector channels continue producing candidates.
- Reciprocal-rank fusion and optional reranking continue to order candidates.
- Each channel records its raw and normalized score.
- The shared selector applies the same relative floor and final document budget.
- Reranking may reorder or reduce candidates; it is no longer required to return exactly the requested limit.
- Keyword/vector/reranker failure keeps the existing deterministic local fallback.

The response records the active infrastructure mode and rejected candidate count without logging source text.

### 7. GraphRAG evidence

Graph traversal continues only for modes selected by the query planner. Change graph evidence selection as follows:

- Reduce the default fact limit from sixteen to eight.
- Normalize ranked fact scores and apply the same `0.55` relative floor.
- Require every selected fact to connect to a query-matched entity, a selected personal-evidence entity, or a selected document source.
- Preserve relation diversity, but never use diversity to admit a fact below the relevance floor.
- Merge graph and document evidence through the shared final budget; deduplication alone is insufficient.
- If graph retrieval fails, retain document RAG and report `graph.status = "fallback"`; do not convert that infrastructure status into a generic answer-quality fallback.

### 8. Quality evaluation and user-facing state

Expected source types become request-aware:

```js
getExpectedRagSourceTypes(intent, {
  usePersonalContext,
  assistantProfile,
})
```

- Knowledge-only requests never require `application-portfolio` or `student-backup`.
- Personalized requests require a personal grounding source only when the user requested personalization.
- Major matching requires `application-portfolio` and `major-encyclopedia` because the server forces personal context for this feature.
- School selection requires `school-encyclopedia` and keeps its existing portfolio checks.

The exact RAG source expectations are:

| Intent/profile | Personal context off | Personal context on |
| --- | --- | --- |
| School | `school-encyclopedia` | `application-portfolio`, `school-encyclopedia` |
| Major | `major-encyclopedia` | `application-portfolio`, `major-encyclopedia` |
| Resource | `resource-library` | `application-portfolio`, `resource-library` |
| Academic | no required knowledge type | `application-portfolio` or `student-backup` |
| Recommendation | no required knowledge type | `application-portfolio` |
| General/profile | no required knowledge type | `application-portfolio` or `student-backup` |
| `major-match` profile | not permitted; server enables personal context | `application-portfolio`, `major-encyclopedia` |

Rows containing “or” use source groups: satisfying either listed personal type covers the group. An empty expected-type list does not mean “quality automatically passes”; `no_sources`, citation integrity, high-risk claims, and output diagnostics are still evaluated independently.

Replace the overloaded “fallback” presentation with three quality states:

- `pass`: evidence and output checks pass.
- `limited_evidence`: retrieval is sparse or an expected source type is unavailable; the answer remains usable with a targeted evidence warning.
- `review_required`: unsupported citations, high-risk admission claims, or truncated output require human review.

Keep the existing `review.fallback` object for response compatibility during this change, but do not use it as the primary UI label. Its `triggered` field is true only for `review_required`, not for a normal knowledge-only request or a graph infrastructure fallback.

Actual model fallback is separate from evidence quality. Propagate the model selected by `createLangChainDeepSeekClient` into quality metadata:

```js
{
  requestedModel,
  selectedModel,
  modelFallbackTriggered: requestedModel !== selectedModel,
}
```

No API key, raw personal evidence, or model error body may enter this metadata.

### 9. Insufficient-evidence behavior

If no candidate clears the relevance floor:

- The model receives an explicit empty-evidence boundary.
- It must answer only from stable general guidance or state what information is missing.
- It must not imply that the student's profile or a specific school/major source was reviewed.
- The UI shows a targeted “可核验资料不足” message, not a system-failure message.

If a required personalized source is empty because the student has not filled it in, return `limited_evidence` with the existing missing-field list. Do not substitute unrelated static documents for the missing personal data.

## Observability

Extend retrieval diagnostics with non-sensitive aggregate fields:

- generated candidate count by channel;
- selected and rejected counts;
- normalized top score and selection floor;
- selected count by source type and scope;
- document and graph character counts;
- quality state and reason codes;
- requested and selected model names.

Do not log questions, source snippets, profile contents, portfolio contents, database connection strings, or API keys.

## Evaluation Design

### Runtime retrieval golden set

Add representative cases that run through the actual local document selector and graph selector. Each case defines:

- query and request mode;
- whether personal context is enabled;
- required relevant source ids or title patterns;
- explicitly irrelevant source ids or title patterns;
- maximum source count;
- expected retrieval mode;
- whether zero results are acceptable or required.

The set must include:

- application profile audit with and without personal context;
- automatic major matching for robotics/AI, humanities, business, and undecided profiles;
- focused school-policy questions;
- competition, summer-school, research, course, and recommendation questions;
- school-selection constraints;
- unrelated and intentionally underspecified questions;
- Chinese and English variants.

### Metrics and gates

Verification fails if any of the following occurs:

- expected-source Recall@5 falls below `1.00` on the existing golden set;
- runtime Precision@K falls below `0.80` overall or below `0.70` in any named category;
- an explicitly irrelevant source appears in a case;
- a negative case exceeds its allowed source count;
- document or graph budgets are exceeded;
- major matching does not include personal grounding and major evidence;
- quality state differs from the request-aware expectation;
- p95 retrieval latency exceeds the permitted regression allowance.

The evaluator prints compact baseline-versus-candidate summaries. Detailed case output is emitted only for failures to keep verification usable.

## Test Strategy

### Pure domain tests

- score normalization, relative floors, score drops, deduplication, deterministic ties, source budgets, and zero-result behavior;
- request-aware expected source types and quality-state classification;
- graph fact filtering and limits.

### Service tests

- automatic major matching forces personal context at the server and includes only current personal data;
- application-robot knowledge-only requests do not read personal services and do not receive false coverage warnings;
- personalized requests retain consent and privacy boundaries;
- local retrieval excludes known irrelevant source patterns from the reproduced queries;
- PostgreSQL merge uses the shared selector rather than appending results;
- selected model metadata reflects real fallback behavior.

### HTTP and client tests

- the major-match browser request sends `usePersonalContext: true`;
- old major-match clients are normalized by the server;
- application-robot free questions preserve the user's toggle;
- the UI distinguishes limited evidence, human review, and actual request failure;
- job submission and resume paths preserve the normalized retrieval scope.

### End-to-end verification

- Run focused RAG and quality tests during implementation.
- Run `npm run verify` after behavior changes.
- Run the runtime retrieval evaluator for both local and GraphRAG paths.
- Smoke-test application robot and major matching at desktop and mobile widths because user-facing quality states change.

## Rollout and Compatibility

Implement in small, independently verifiable stages:

1. Lock down the current failure cases with tests and evaluation fixtures.
2. Correct request scope and quality expectations.
3. Add the shared relevance selector and migrate local retrieval.
4. Migrate PostgreSQL and graph evidence into the shared budget.
5. Update quality-state UI and model-fallback metadata.
6. Run the complete regression, retrieval-quality, privacy, and browser gates.

Existing API fields remain available during the migration. New diagnostics are additive. Cache variants include the relevance policy version so previously cached broad result sets cannot bypass the new selector.

## Risks and Mitigations

- **Precision gains reduce recall:** keep Recall@5 at `1.00` as a hard gate and use category-level precision floors.
- **Static and PostgreSQL scores are not comparable:** normalize within each channel before the shared selector and retain deterministic tie-breaks.
- **Generic queries return no evidence:** treat this as a valid limited-evidence outcome and provide stable general guidance rather than noise.
- **Personal context grows too large:** cap it at three structured documents and the combined character budget.
- **Graph diversity reintroduces noise:** apply the relevance floor before diversity selection.
- **Provider reranking is unavailable:** local deterministic selection remains the required fallback and must pass the same golden set.
- **Old clients omit the major-match context flag:** normalize it on the server according to the feature profile.
