# LangChain And LangGraph Migration Plan

Created: 2026-07-02

## Objective

Improve the existing DeepSeek/RAG and planning-agent stack without rewriting the product. The migration should keep the native Node.js server, static browser ESM frontend, current API response contracts, AI quality gates, auth boundaries, and offline tests intact while introducing LangChain and LangGraph in small, reversible slices.

## Current Baseline

- DeepSeek planning calls now go through the server-only LangChain adapter in `src/server/langchain-llm-client.mjs`.
- Ask DeepSeek RAG answer drafting now goes through the same server-only LangChain adapter while retrieval and quality checks stay in `src/server/deepseek-rag-service.mjs`.
- School selection and portfolio capability calls also go through the LangChain adapter behind their existing service contracts.
- Ask DeepSeek RAG, portfolio capability assessment, and school selection now run through LangGraph workflows with aggregate graph metrics.
- `server.mjs` no longer exposes a raw `deepSeekFetch` injection path for product AI routes; focused tests inject mock LangChain clients instead.
- RAG currently uses Markdown data from `data/*.md`, student profile data, planning backups, and application portfolio data.
- AI quality metadata, citation checks, high-risk claim checks, and golden offline evaluation already exist in `src/server/ai-quality.mjs`, `scripts/evaluate-ai-quality.mjs`, and `tests/fixtures/ai-quality-golden.json`.
- Background generation is already handled through `src/server/generation-job-service.mjs`.
- Server tests must not require real DeepSeek or SMTP credentials.

## Source-Checked Technology Decisions

- Use `@langchain/deepseek` for DeepSeek chat model calls. The official integration documents `ChatDeepSeek`, installation with `@langchain/deepseek @langchain/core`, constructor fields such as `apiKey`, `model`, `temperature`, and invocation through `.invoke()`.
  Source: https://docs.langchain.com/oss/javascript/integrations/chat/deepseek
- Use LangGraph only after the LLM adapter and RAG interfaces are stable. LangGraph's JavaScript docs center graph workflows around `StateGraph`, nodes, edges, and compiled graphs.
  Source: https://docs.langchain.com/oss/javascript/langgraph/graph-api
- Add LangGraph persistence later, not in the first slice. The persistence docs separate short-term thread state with checkpointers from longer-term memory stores, which needs an explicit privacy and storage design before touching user data.
  Source: https://docs.langchain.com/oss/javascript/langgraph/persistence

## Architecture Direction

Keep the current public API stable:

```text
browser page -> existing server route -> service module -> adapter/retriever/graph -> response contract
```

Do not make browser modules import LangChain or LangGraph. These packages stay server-only.

## Phase 1: LangChain LLM Adapter

**Goal:** Add a small server-only adapter around `ChatDeepSeek` without changing existing DeepSeek route behavior.

**Tasks:**

- [x] Add `@langchain/deepseek` and `@langchain/core`.
- [x] Add `src/server/langchain-llm-client.mjs`.
- [x] Add focused tests with a mock chat model.
- [x] Switch `src/server/deepseek-plan-service.mjs` to the adapter behind the existing response contract.
- [x] Preserve `/api/deepseek-plan` and `/api/deepseek-plan-jobs` observability metrics after the fetch wrapper no longer sees planning calls.
- [x] Switch Ask DeepSeek RAG answer drafting to the adapter behind the existing `/api/deepseek-rag` and `/api/deepseek-rag-jobs` contracts.
- [x] Preserve `deepseek-rag` observability metrics after the fetch wrapper no longer sees RAG calls.
- [x] Switch school selection generation to the adapter behind the existing `/api/school-selection` and `/api/school-selection-jobs` contracts.
- [x] Switch portfolio capability assessment generation to the adapter behind the existing `/api/portfolio-capability-assessment` and `/api/portfolio-capability-assessment-jobs` contracts.
- [x] Remove the raw DeepSeek HTTP injection path from `server.mjs`.

**Acceptance criteria:**

- Adapter resolves only server-side `DEEPSEEK_API_KEY`; request-provided keys remain out of scope.
- Adapter normalizes existing DeepSeek model aliases through `normalizeDeepSeekModel`.
- Tests do not call real DeepSeek.
- `npm run check`, focused adapter tests, and AI evaluation pass.

## Phase 2: RAG Pipeline Interface

**Goal:** Split retrieval from generation so LangChain retrieval can be introduced without changing Ask DeepSeek UI.

**Tasks:**

- [x] Extract a `createRagRetriever(...)` boundary inside `deepseek-rag-service.mjs`.
- [x] Add focused tests for the retriever contract, Markdown chunking, and source serialization.
- [x] Define a stable retriever contract:

```js
retrieve({
  user,
  question,
  assistantProfile,
  historySummary,
}) -> {
  context,
  sources,
  retrieval,
  missingFields,
}
```

**Acceptance criteria:**

- Existing RAG tests still prove portfolio, student backups, resources, school encyclopedia, and major encyclopedia are available.
- Citation metadata remains stable.
- `npm run eval:ai` does not regress retrieval hit-rate thresholds.

## Phase 3: LangChain Documents And Optional Semantic Retrieval

**Goal:** Represent project knowledge as LangChain-compatible documents while preserving current source IDs and citations.

**Tasks:**

- [x] Convert Markdown/student chunks into LangChain `Document` objects with `pageContent` and metadata.
- [x] Keep the current lexical scorer as the default retriever.
- [x] Evaluate whether embeddings/vector storage is justified after baseline tests.
- Current decision: do not add embeddings/vector storage while `npm run eval:ai` keeps retrieval hit-rate thresholds green.

**Acceptance criteria:**

- No admissions facts, requirements, rankings, or deadlines are generated without source metadata.
- Retrieval remains deterministic in tests.
- Semantic retrieval, if added, has fixtures for false positives and missing-source behavior.

## Phase 4: First LangGraph Workflow

**Goal:** Use LangGraph for one vertical Ask DeepSeek workflow, likely profile audit or activity boost.

**Tasks:**

- [x] Add `@langchain/langgraph`.
- [x] Add `src/server/langgraph-rag-workflow.mjs`.
- [x] Route Ask DeepSeek RAG answer generation through a LangGraph state workflow while preserving the existing HTTP and job response contracts.
- [x] Add graph-specific tests and expose `workflowVersion` in RAG quality metadata.
- [x] Add graph-level operational counters for workflow runs, node failures, and review-required rates without recording raw prompts, retrieved context, or private graph state.
- [x] Add `src/server/langgraph-portfolio-capability-workflow.mjs`.
- [x] Route portfolio capability assessment through a LangGraph state workflow while preserving the existing HTTP and job response contracts.
- [x] Expose the portfolio workflow version in portfolio capability quality metadata.
- [x] Add `src/server/langgraph-school-selection-workflow.mjs`.
- [x] Route school selection through a LangGraph state workflow while preserving the existing HTTP and job response contracts.
- [x] Expose the school selection workflow version in school selection quality metadata.

**Candidate graph:**

```text
loadUserContext -> classifyIntent -> retrieveSources -> draftAnswer -> evaluateQuality -> finalizeResponse
```

Portfolio capability graph:

```text
loadPortfolio -> assessDimensions -> validateNoSchoolAdvice -> saveAssessment -> finalizeResponse
```

School selection graph:

```text
loadContext -> draftSelection -> calibrateSelection -> evaluateQuality -> finalizeResponse
```

**Acceptance criteria:**

- Existing `/api/deepseek-rag-jobs`, `/api/portfolio-capability-assessment-jobs`, and `/api/school-selection-jobs` contracts remain compatible.
- Quality metadata still includes prompt, model, source-set, parser, evaluator, and workflow versions.
- Low-confidence, unsupported citation, no-source, and high-risk claim cases trigger review/fallback.

## Phase 5: Persistence And Human Review

**Goal:** Add LangGraph persistence only after storage and privacy boundaries are explicit.

**Tasks:**

- [x] Decide whether checkpoints live in memory, SQLite, or a dedicated table.
- [x] Document retention and deletion behavior required before persistence can be enabled.
- [x] Confirm graph outputs require explicit user save/apply actions before writing back into portfolio notes or action lists.

**Acceptance criteria:**

- Current implementation creates no LangGraph checkpoints or memory stores.
- Future checkpoints must be user-owned and deleted with account deletion.
- Admin views must not expose raw private essays or sensitive graph state by default.

Design note: `docs/LANGGRAPH_PERSISTENCE_PRIVACY_DESIGN.md`.

## Verification Plan

- Adapter changes: `node tests/langchain-llm-client.test.mjs`, `npm run check`.
- AI behavior changes: relevant DeepSeek/RAG, school selection, portfolio capability, and observability tests plus `npm run eval:ai`.
- Full code changes: `npm run verify`.
- Frontend changes, when added later: browser smoke checks at desktop and 390px mobile widths.

## Risks And Guardrails

| Risk | Impact | Mitigation |
| --- | --- | --- |
| API contract drift | Existing frontend breaks | Keep route responses stable and test old contracts |
| Retrieval quality regression | Worse advice and weaker citations | Keep golden fixtures and source-type hit-rate thresholds |
| Hidden user-data persistence | Privacy/data rights risk | Delay LangGraph persistence until storage design is explicit |
| Dependency churn | Harder local setup | Add only server-side packages needed for each phase |
| Prompt/version ambiguity | Evaluation results become hard to compare | Bump `AI_QUALITY_VERSIONS` when prompts, parsers, or source sets change |

## Future Follow-Up

Improve user-facing review/apply controls and admin visibility for AI quality signals as a product polish track. Keep semantic retrieval out unless golden AI evaluation exposes a real retrieval weakness.
