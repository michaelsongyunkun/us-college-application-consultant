# ADR-003: Use Selective Query and Knowledge-Graph RAG Orchestration

## Status

Accepted on 2026-08-03.

## Context

Application Q&A, major matching, and school selection previously relied mainly on direct Markdown chunk retrieval. This works for focused lookups but is weaker for multi-hop questions such as connecting student evidence to majors, majors to schools, and schools to application rounds. Applying graph traversal to every request would add latency and maintenance cost without improving simple factual lookups.

## Decision

Place one deep retrieval module at `src/server/retrieval-orchestrator.mjs`. Its `retrieve(input)` interface hides query planning, graph traversal, document retrieval, evidence merging, and graph-failure fallback.

The deterministic planner selects one mode:

- `direct` for the inspiration assistant, which does not retrieve application knowledge.
- `hybrid-rag` for focused lookups and summaries.
- `graph-rag` for multi-hop application strategy and all major-matching requests.
- `graph-rag-with-constraints` for school selection and school questions with explicit round or preference constraints.

The workflow exposes only auditable steps, structured constraints, evidence, and aggregate traversal statistics. Raw model chain-of-thought is neither requested, stored, logged, nor returned.

The knowledge graph is built deterministically from curated Markdown through existing structured parsers. PostgreSQL deployments persist entities and relations in `knowledge_entities` and `knowledge_relations`; local deployments build the same graph in memory. PostgreSQL failures or empty graph tables fall back to the local graph, while graph retrieval failures fall back to document RAG.

## Consequences

- Existing frontend and HTTP request contracts remain compatible.
- Major matching and school selection gain multi-hop evidence without duplicating graph logic.
- Simple application questions retain lower-cost hybrid retrieval.
- Graph relations keep source ids, confidence, version, validity metadata, and optional official URLs so time-sensitive claims remain reviewable.
- Homepage plan generation and capability assessment remain outside GraphRAG until evaluation demonstrates a material quality gain.
