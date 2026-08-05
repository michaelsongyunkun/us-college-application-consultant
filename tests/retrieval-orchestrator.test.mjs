import assert from "node:assert/strict";
import { createRetrievalOrchestrator } from "../src/server/retrieval-orchestrator.mjs";

const calls = [];
const orchestrator = createRetrievalOrchestrator({
  documentRetriever: {
    async retrieve(input) {
      calls.push(["documents", input.queryPlan.mode]);
      return {
        context: "Document context",
        sources: [{ id: "doc-1", type: "major-encyclopedia", title: "Major document" }],
        retrieval: { selectedDocuments: 1, totalDocuments: 10 },
        missingFields: ["GPA"],
      };
    },
  },
  knowledgeGraph: {
    async search(input) {
      calls.push(["graph", input.queryPlan.mode]);
      return {
        adapter: "test-graph",
        context: "Major --STRONG_FOR_MAJOR--> School",
        sources: [
          { id: "kg:fact-1", sourceId: "doc-1", type: "knowledge-graph", title: "Major to school" },
          { id: "kg:fact-noise", sourceId: "other", type: "knowledge-graph", title: "Unrelated fact" },
        ],
        facts: [
          {
            id: "fact-1",
            score: 10,
            sourceId: "doc-1",
            queryAnchored: true,
            subject: { id: "major:cs", name: "Computer Science" },
            predicate: "STRONG_FOR_MAJOR",
            object: { id: "school:mit", name: "MIT" },
          },
          {
            id: "fact-noise",
            score: 1,
            sourceId: "other",
            queryAnchored: false,
            evidenceAnchored: false,
            subject: { id: "major:noise", name: "Noise" },
            predicate: "UNRELATED_TO",
            object: { id: "school:other", name: "Other" },
          },
        ],
        traversal: { seedEntities: ["major:cs"], visitedEntities: 3, selectedFacts: 2, maxDepth: 2 },
      };
    },
  },
});

const graphResult = await orchestrator.retrieve({
  question: "结合我的机器人项目匹配专业和强校",
  assistantProfile: "major-match",
});
assert.deepEqual(calls, [["documents", "graph-rag"], ["graph", "graph-rag"]]);
assert.match(graphResult.context, /Knowledge graph relationships/u);
assert.match(graphResult.context, /Retrieved document evidence/u);
assert.equal(graphResult.sources.length, 2);
assert.equal(graphResult.retrieval.mode, "graph-rag");
assert.equal(graphResult.retrieval.graph.status, "applied");
assert.equal(graphResult.retrieval.graph.selectedFacts, 1);
assert.doesNotMatch(graphResult.context, /fact-noise|UNRELATED_TO/u);
assert.ok(graphResult.sources.length <= 9);
assert.deepEqual(graphResult.missingFields, ["GPA"]);

const budgetedOrchestrator = createRetrievalOrchestrator({
  documentRetriever: {
    async retrieve() {
      return {
        context: "Personalized document context",
        sources: [
          ...Array.from({ length: 6 }, (_, index) => ({
            id: `doc-${index + 1}`,
            type: "major-encyclopedia",
            scope: "knowledge",
            title: `Major document ${index + 1}`,
          })),
          ...Array.from({ length: 3 }, (_, index) => ({
            id: `personal-${index + 1}`,
            type: "application-portfolio",
            scope: "personal",
            title: `Personal document ${index + 1}`,
          })),
        ],
        retrieval: { selectedDocuments: 9, totalDocuments: 20 },
      };
    },
  },
  knowledgeGraph: {
    async search() {
      return {
        adapter: "test-graph",
        sources: Array.from({ length: 8 }, (_, index) => ({
          id: `kg:budget-${index + 1}`,
          sourceId: index < 2 ? "data/majors.md" : `data/source-${index + 1}.md`,
          type: "knowledge-graph",
          title: `Graph fact ${index + 1}`,
        })),
        facts: Array.from({ length: 8 }, (_, index) => ({
          id: `budget-${index + 1}`,
          score: 10 - index,
          sourceId: index < 2 ? "data/majors.md" : `data/source-${index + 1}.md`,
          queryAnchored: true,
          subject: { id: `major:${index}`, name: `Major ${index}` },
          predicate: "RELATED_TO",
          object: { id: `school:${index}`, name: `School ${index}` },
        })),
        traversal: { seedEntities: ["major:0"], visitedEntities: 16, selectedFacts: 8, maxDepth: 2 },
      };
    },
  },
});
const budgetedResult = await budgetedOrchestrator.retrieve({
  question: "Match my robotics profile to majors and schools",
  assistantProfile: "major-match",
  usePersonalContext: true,
});
assert.equal(budgetedResult.sources.length, 9, "Document and graph citations must share one personalized source budget.");
assert.equal(budgetedResult.retrieval.selectedDocuments, 9);
assert.ok(
  budgetedResult.sources.some((source) => source.type === "knowledge-graph"),
  "A relevant graph citation should retain one slot inside the shared source budget.",
);
assert.ok(
  budgetedResult.retrieval.graph.selectedFacts > 0
    && budgetedResult.retrieval.graph.selectedFacts <= 8,
  "Graph context may retain relevant facts up to its independent eight-fact budget even when citation slots are full.",
);

calls.length = 0;
const lookupResult = await orchestrator.retrieve({ question: "MIT 的推荐信要求是什么？" });
assert.deepEqual(calls, [["documents", "hybrid-rag"]]);
assert.equal(lookupResult.retrieval.mode, "hybrid-rag");
assert.equal(lookupResult.retrieval.graph.status, "not-required");

const fallbackWarnings = [];
const fallback = createRetrievalOrchestrator({
  documentRetriever: { async retrieve() { return { context: "safe", sources: [], retrieval: {} }; } },
  knowledgeGraph: { async search() { throw new Error("private graph failure"); } },
  logger: { warn(event) { fallbackWarnings.push(event); } },
});
const fallbackResult = await fallback.retrieve({
  question: "帮我匹配专业",
  assistantProfile: "major-match",
});
assert.equal(fallbackResult.retrieval.graph.status, "fallback");
assert.equal(JSON.stringify(fallbackWarnings).includes("private graph failure"), false);
