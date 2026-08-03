import assert from "node:assert/strict";
import {
  RETRIEVAL_MODES,
  createRetrievalQueryPlan,
  shouldUseKnowledgeGraph,
} from "../src/domain/retrieval-query-plan.mjs";

const schoolSelection = createRetrievalQueryPlan({
  query: "帮我按 Data Science、东海岸、预算和 ED/EA 约束生成选校方案",
  taskType: "school-selection",
});
assert.equal(schoolSelection.mode, RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS);
assert.equal(schoolSelection.primaryIntent, "school");
assert.deepEqual(schoolSelection.constraints.rounds, ["ED1", "EA"]);
assert.equal(schoolSelection.constraints.budget, true);
assert.equal(schoolSelection.constraints.region, true);
assert.ok(schoolSelection.steps.includes("constraint_validation"));

const majorMatch = createRetrievalQueryPlan({
  query: "结合我的机器人活动和数学课程，匹配适合的专业",
  assistantProfile: "major-match",
});
assert.equal(majorMatch.mode, RETRIEVAL_MODES.GRAPH_RAG);
assert.equal(majorMatch.primaryIntent, "major");
assert.equal(shouldUseKnowledgeGraph(majorMatch), true);

const complexApplicationQuestion = createRetrievalQueryPlan({
  query: "比较我的活动、目标专业和选校是否一致，并给出补强策略",
});
assert.equal(complexApplicationQuestion.mode, RETRIEVAL_MODES.GRAPH_RAG);
assert.ok(complexApplicationQuestion.intents.includes("school"));
assert.ok(complexApplicationQuestion.intents.includes("major"));

const directLookup = createRetrievalQueryPlan({ query: "MIT 的推荐信要求是什么？" });
assert.equal(directLookup.mode, RETRIEVAL_MODES.HYBRID_RAG);

const englishRecommendationLookup = createRetrievalQueryPlan({
  query: "Summarize Stanford recommendation letter expectations.",
});
assert.equal(
  englishRecommendationLookup.mode,
  RETRIEVAL_MODES.HYBRID_RAG,
  "The word recommendation must not be mistaken for the multi-hop verb recommend.",
);

const explicitRoundQuery = createRetrievalQueryPlan({ query: "Should I use ED1 for this application?" });
assert.equal(explicitRoundQuery.mode, RETRIEVAL_MODES.GRAPH_RAG_WITH_CONSTRAINTS);
assert.deepEqual(explicitRoundQuery.constraints.rounds, ["ED1"]);

const inspiration = createRetrievalQueryPlan({
  query: "我最近总是在想机器人项目",
  assistantProfile: "inspiration",
});
assert.equal(inspiration.mode, RETRIEVAL_MODES.DIRECT);
assert.equal(shouldUseKnowledgeGraph(inspiration), false);
