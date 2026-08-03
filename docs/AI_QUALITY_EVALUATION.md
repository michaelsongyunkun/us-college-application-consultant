# AI Quality Evaluation

This project now has a deterministic offline gate for AI reliability work. It does not call DeepSeek and does not require API keys.

## Commands

- `npm run eval:ai`: runs the golden fixture checks.
- `npm run eval:retrieval`: compares keyword and hybrid document retrieval on 120 bilingual cases.
- `npm run eval:graph-rag`: compares document-only RAG with selective GraphRAG on multi-hop admissions cases and verifies graph fallback.
- `npm run verify`: still runs syntax checks and the full regression suite, including evaluator unit tests.

## Golden Fixture

The golden fixture lives at `tests/fixtures/ai-quality-golden.json` and currently covers:

- RAG Q&A retrieval coverage, source citations, unsupported citation flags, and high-risk claim flags.
- Planning output parser shape.
- School selection JSON schema validation through the production validator.
- Portfolio capability assessment shape and score bounds.

The evaluator prints one pass/fail line per threshold and exits nonzero when a regression is detected.

## GraphRAG Golden Fixture

`tests/fixtures/graph-rag-golden.json` covers bilingual student-evidence-to-major, major-to-school, and school-to-application-round paths. The deterministic evaluator checks document-source recall, graph-source recall, relation predicates, exact relationship anchors, query-mode routing, structured round constraints, graph adapter status, fallback continuity, and baseline/candidate latency. It does not call an LLM or require API keys.

The GraphRAG gate requires the candidate to improve structured evidence coverage over document-only RAG while preserving document coverage. A forced graph failure must retain document context and report `retrieval.graph.status` as `fallback`.

## Response Metadata

AI responses now include a `quality` object with:

- `metadata.feature`
- `metadata.promptVersion`
- `metadata.model`
- `metadata.sourceSetVersion`
- `metadata.parserVersion`
- `metadata.evaluatorVersion`

RAG-backed responses also include:

- `citations`: source ids, titles, and types exposed as stable citation metadata.
- `retrieval.retrievalHitRate`: coverage of expected source types.
- `hallucination.unsupportedCitations`: citation markers that reference sources outside retrieved context.
- `hallucination.highRiskClaims`: absolute admissions claims such as guaranteed admission.
- `review`: human-review and fallback flags for low confidence, missing sources, unsupported citations, or high-risk claims.
- `retrieval.mode`: `hybrid-rag`, `graph-rag`, or `graph-rag-with-constraints`.
- `retrieval.queryPlan`: the auditable task type, detected intent, structured constraints, and evidence-processing steps. It is a workflow trace, not raw model chain-of-thought.
- `retrieval.graph`: graph adapter status and aggregate seed, visited-entity, selected-fact, and traversal-depth counts.

## Response Length Governance

RAG answers use layered limits so a single response cannot grow without a bound:

- Standard RAG requests default to `1600` output tokens; major-match requests default to `2200` output tokens.
- The server caps the final answer at `12000` characters, preserves Markdown fence balance when truncating, and appends a continuation hint after either local truncation or a provider `finish_reason` of `length`.
- Answers longer than `3000` characters are collapsed by default in the browser and provide accessible expand/collapse controls.
- `quality.output` records original and returned character counts, the configured character and token limits, local truncation state, and the provider `finish_reason`.
- AI observability aggregates prompt, completion, and total token usage, output character counts, and finish reasons by feature.
- Local truncation or a provider `finish_reason` of `length` adds `response_too_long` to the human-review reasons.

Deployments can override the defaults with `DEEPSEEK_RAG_MAX_TOKENS`, `DEEPSEEK_MAJOR_MATCH_MAX_TOKENS`, and `DEEPSEEK_RAG_MAX_ANSWER_CHARS`.

## Version Registry

Prompt, parser, source-set, and evaluator versions are defined in `src/server/ai-quality.mjs`. Any future prompt or parser behavior change should bump the relevant version and update the golden fixture or tests in the same change.
