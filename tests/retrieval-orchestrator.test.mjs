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

const applicationBudgetOrchestrator = createRetrievalOrchestrator({
  documentRetriever: {
    async retrieve() {
      return {
        context: "D".repeat(18_000),
        sources: [{ id: "application-doc", type: "resource-library", scope: "knowledge", title: "Application evidence" }],
        retrieval: { selectedDocuments: 1, totalDocuments: 1 },
      };
    },
  },
  knowledgeGraph: {
    async search() {
      return {
        adapter: "test-graph",
        sources: Array.from({ length: 8 }, (_, index) => ({
          id: `kg:application-${index + 1}`,
          sourceId: `data/application-${index + 1}.md`,
          type: "knowledge-graph",
          title: `Application graph fact ${index + 1}`,
        })),
        facts: Array.from({ length: 8 }, (_, index) => ({
          id: `application-${index + 1}`,
          score: 10,
          sourceId: `data/application-${index + 1}.md`,
          queryAnchored: true,
          subject: { id: `resource:${index}`, name: `Resource ${index}` },
          predicate: "SUPPORTS",
          object: { id: `activity:${index}`, name: `Activity ${index}` },
        })),
        traversal: { seedEntities: ["resource:0"], visitedEntities: 16, selectedFacts: 8, maxDepth: 2 },
      };
    },
  },
});
const applicationBudgetResult = await applicationBudgetOrchestrator.retrieve({
  question: "Compare activities and resources for an application strategy",
  usePersonalContext: false,
  queryPlan: {
    mode: "graph-rag",
    taskType: "application",
    primaryIntent: "resource",
    intents: ["resource"],
    constraints: {},
    steps: [],
  },
});
assert.equal(applicationBudgetResult.retrieval.graph.selectedFacts, 6);
assert.ok(applicationBudgetResult.context.length <= 18_000, "Knowledge-only application context must respect its 18k combined budget.");
assert.ok(applicationBudgetResult.retrieval.contextCharacters.combined <= 18_000);
assert.equal(applicationBudgetResult.retrieval.selectedSourceCounts.byScope.knowledge, applicationBudgetResult.sources.length);

const atomicContextOrchestrator = createRetrievalOrchestrator({
  documentRetriever: {
    async retrieve() {
      return {
        context: [
          `[1] 资源库 | Complete first chunk\n${"A".repeat(9_000)}`,
          `[2] 资源库 | Second chunk must stay atomic\n${"B".repeat(9_000)}`,
        ].join("\n\n---\n\n"),
        sources: [
          { id: "atomic-doc-1", type: "resource-library", scope: "knowledge", title: "Complete first chunk" },
          { id: "atomic-doc-2", type: "resource-library", scope: "knowledge", title: "Second chunk must stay atomic" },
        ],
        retrieval: { selectedDocuments: 2, totalDocuments: 2 },
      };
    },
  },
  knowledgeGraph: {
    async search() {
      return {
        adapter: "atomic-test-graph",
        sources: [{ id: "kg:atomic", sourceId: "data/atomic.md", type: "knowledge-graph", title: "Atomic fact" }],
        facts: [{
          id: "atomic",
          score: 10,
          sourceId: "data/atomic.md",
          queryAnchored: true,
          subject: { id: "major:atomic", name: "Atomic Major" },
          predicate: "RELATED_TO",
          object: { id: "school:atomic", name: "Atomic School" },
        }],
        traversal: { seedEntities: ["major:atomic"], visitedEntities: 2, selectedFacts: 1, maxDepth: 1 },
      };
    },
  },
});
const atomicContextResult = await atomicContextOrchestrator.retrieve({
  question: "Compare and prioritize this major and school",
  queryPlan: {
    mode: "graph-rag",
    taskType: "application",
    primaryIntent: "major",
    intents: ["major", "school"],
    constraints: {},
    steps: [],
  },
});
assert.match(atomicContextResult.context, /Complete first chunk/u);
assert.doesNotMatch(
  atomicContextResult.context,
  /Second chunk must stay atomic|B{20}/u,
  "Combined GraphRAG context must omit an over-budget chunk instead of cutting it mid-chunk.",
);
assert.equal(
  atomicContextResult.sources.some((source) => source.id === "atomic-doc-2"),
  false,
  "Visible sources must stay aligned with the complete chunks actually sent to the model.",
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
