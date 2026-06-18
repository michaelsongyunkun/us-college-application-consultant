# AI Quality Evaluation

This project now has a deterministic offline gate for AI reliability work. It does not call DeepSeek and does not require API keys.

## Commands

- `npm run eval:ai`: runs the golden fixture checks.
- `npm run verify`: still runs syntax checks and the full regression suite, including evaluator unit tests.

## Golden Fixture

The golden fixture lives at `tests/fixtures/ai-quality-golden.json` and currently covers:

- RAG Q&A retrieval coverage, source citations, unsupported citation flags, and high-risk claim flags.
- Planning output parser shape.
- School selection JSON schema validation through the production validator.
- Portfolio capability assessment shape and score bounds.

The evaluator prints one pass/fail line per threshold and exits nonzero when a regression is detected.

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

## Version Registry

Prompt, parser, source-set, and evaluator versions are defined in `src/server/ai-quality.mjs`. Any future prompt or parser behavior change should bump the relevant version and update the golden fixture or tests in the same change.
