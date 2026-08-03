import assert from "node:assert/strict";
import {
  buildAdmissionsKnowledgeGraph,
  searchAdmissionsKnowledgeGraph,
} from "../src/domain/admissions-knowledge-graph.mjs";
import { createRetrievalQueryPlan } from "../src/domain/retrieval-query-plan.mjs";

const graph = buildAdmissionsKnowledgeGraph({
  majors: [{
    id: "major-cs",
    title: "Computer Science 计算机科学",
    englishName: "Computer Science",
    chineseName: "计算机科学",
    category: "计算机、数据与信息技术",
    learningContent: "编程、算法、数据结构、AI",
    careerPaths: "软件工程师、AI工程师",
    strongSchools: "MIT、Stanford",
    admissionDifficulty: "极高",
  }],
  schools: [{
    id: "university-2-mit",
    name: "麻省理工 MIT",
    category: "university",
    rank: "2",
    location: "Cambridge, Massachusetts",
  }],
  applicationRoundSchools: [{
    name: "Massachusetts Institute of Technology",
    rounds: { ea: "是", rd: "是", ed1: "否" },
  }],
});

assert.ok(graph.entities.some((entity) => entity.type === "major" && entity.name.includes("Computer Science")));
assert.ok(graph.relations.some((relation) => relation.type === "STUDIES_TOPIC"));
assert.ok(graph.relations.some((relation) => relation.type === "STRONG_FOR_MAJOR"));
assert.ok(graph.relations.some((relation) => relation.type === "SUPPORTS_APPLICATION_ROUND"));

const plan = createRetrievalQueryPlan({
  query: "结合我的机器人和 AI 项目匹配 Computer Science 专业与强校",
  assistantProfile: "major-match",
});
const result = searchAdmissionsKnowledgeGraph(graph, {
  query: "Computer Science AI MIT",
  queryPlan: plan,
  evidenceText: "机器人项目，编程和 AI",
});

assert.ok(result.facts.length > 0);
assert.match(result.context, /Computer Science/u);
assert.ok(result.sourceIds.includes("data/majors.md"));
assert.equal(result.traversal.maxDepth, 2);

const roundPlan = createRetrievalQueryPlan({
  query: "MIT EA 选校",
  taskType: "school-selection",
});
const roundResult = searchAdmissionsKnowledgeGraph(graph, {
  query: "MIT EA",
  queryPlan: roundPlan,
});
assert.ok(roundResult.facts.some((fact) => fact.predicate === "SUPPORTS_APPLICATION_ROUND" && fact.object.name === "EA"));

const distinctSchoolGraph = buildAdmissionsKnowledgeGraph({
  schools: [
    { id: "stanford", name: "斯坦福 Stanford", category: "university" },
    { id: "sorbonne", name: "索邦大学 Sorbonne University", category: "other-region" },
    { id: "duke", name: "杜克 Duke", category: "university" },
    { id: "mit", name: "麻省理工 MIT", category: "university" },
    { id: "cmu", name: "卡内基梅隆 CMU", category: "university" },
    { id: "paris-saclay", name: "巴黎-萨克雷大学 Université Paris-Saclay", category: "other-region" },
  ],
  applicationRoundSchools: [
    { name: "Stanford University", rounds: { rea: "是", rd: "是", ea: "否", ed1: "否" } },
    { name: "Duke University", rounds: { ed1: "是", rd: "是", rea: "否" } },
    { name: "Massachusetts Institute of Technology", rounds: { ea: "是", rd: "是", ed1: "否" } },
    { name: "Carnegie Mellon University", rounds: { ed1: "是", rd: "是" } },
    { name: "Boston University", rounds: { ed1: "是", rd: "是" } },
  ],
});

const stanford = distinctSchoolGraph.entities.find((entity) => entity.name.includes("Stanford"));
const sorbonne = distinctSchoolGraph.entities.find((entity) => entity.name.includes("Sorbonne"));
const duke = distinctSchoolGraph.entities.find((entity) => entity.name.includes("Duke"));
const mit = distinctSchoolGraph.entities.find((entity) => entity.name.includes("MIT"));
const cmu = distinctSchoolGraph.entities.find((entity) => entity.name.includes("CMU"));
const parisSaclay = distinctSchoolGraph.entities.find((entity) => entity.name.includes("Paris-Saclay"));
assert.ok(stanford && sorbonne && duke && mit && cmu && parisSaclay);
assert.equal(new Set([stanford.id, sorbonne.id, duke.id, mit.id, cmu.id, parisSaclay.id]).size, 6, "School acronyms must not collapse distinct entities.");
assert.equal(stanford.aliases.includes("Duke University"), false);
assert.equal(sorbonne.aliases.includes("Stanford University"), false);
assert.equal(parisSaclay.aliases.includes("Boston University"), false);

const roundNamesFor = (school) => distinctSchoolGraph.relations
  .filter((relation) => relation.from === school.id && relation.type === "SUPPORTS_APPLICATION_ROUND")
  .map((relation) => distinctSchoolGraph.entities.find((entity) => entity.id === relation.to)?.name)
  .sort();
assert.deepEqual(roundNamesFor(stanford), ["RD", "REA"]);
assert.deepEqual(roundNamesFor(duke), ["ED1", "RD"]);
assert.deepEqual(roundNamesFor(mit), ["EA", "RD"]);
assert.deepEqual(roundNamesFor(cmu), ["ED1", "RD"]);

const constrainedGraph = buildAdmissionsKnowledgeGraph({
  schools: Array.from({ length: 20 }, (_, index) => ({
    id: `school-${index + 1}`,
    name: `Unrelated College ${index + 1}`,
    category: "university",
  })),
  applicationRoundSchools: [
    { name: "Massachusetts Institute of Technology", rounds: { ea: "是" } },
    ...Array.from({ length: 20 }, (_, index) => ({
      name: `Unrelated College ${index + 1}`,
      rounds: { ea: "是" },
    })),
  ],
});
const constrainedPlan = createRetrievalQueryPlan({ query: "MIT EA 选校", taskType: "school-selection" });
const constrainedResult = searchAdmissionsKnowledgeGraph(constrainedGraph, {
  query: "MIT EA",
  queryPlan: constrainedPlan,
});
assert.equal(
  constrainedResult.traversal.seedEntities.some((entityId) => entityId.includes("unrelated")),
  false,
  "Intent boosts must not seed every school without lexical evidence.",
);
assert.ok(
  constrainedResult.facts.some((fact) => fact.subject.name === "Massachusetts Institute of Technology"
    && fact.predicate === "SUPPORTS_APPLICATION_ROUND"
    && fact.object.name === "EA"),
  "Exact acronym matches should prioritize the requested school-round relationship.",
);
assert.equal(constrainedResult.facts[0].subject.name, "Massachusetts Institute of Technology");
