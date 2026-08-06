import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseApplicationRoundSchoolsMarkdown } from "../src/domain/application-round-schools.mjs";
import {
  buildSchoolSelectionPortfolioContext,
  buildSchoolSelectionRagContext,
  createSchoolSelectionService,
  validateSchoolSelectionResult,
} from "../src/server/school-selection-service.mjs";
import { SCHOOL_SELECTION_GRAPH_VERSION } from "../src/server/langgraph-school-selection-workflow.mjs";

const schoolContextSelection = buildSchoolSelectionRagContext([
  { id: "school-context-1", title: "Complete school chunk", text: "A".repeat(8_000) },
  { id: "school-context-2", title: "Over-budget school chunk", text: "B".repeat(8_000) },
], 12_000);
assert.deepEqual(schoolContextSelection.included.map((source) => source.id), ["school-context-1"]);
assert.doesNotMatch(schoolContextSelection.context, /Over-budget school chunk|B{20}/u);

const personalContextSelection = buildSchoolSelectionPortfolioContext({
  applicationPlan: {
    ea: Array.from({ length: 40 }, (_, index) => ({
      school: `Unrelated College ${index + 1}`,
      major: "General Studies",
    })),
  },
  activities: [{
    activityName: "Capstone Civic Data Lab",
    description: "Applied Data Science to map transit access gaps in California.",
  }],
  academicRecords: { gpaScale: "4.0分制", satTests: [{ totalScore: "1510" }] },
}, {
  targetMajor: "Data Science",
  regionPreference: "California",
}, 1_200);
const serializedPersonalContext = JSON.stringify(personalContextSelection, null, 2);
assert.ok(serializedPersonalContext.length <= 1_200);
assert.match(serializedPersonalContext, /Capstone Civic Data Lab/u);
assert.match(serializedPersonalContext, /1510/u);
assert.ok(
  personalContextSelection.every((chunk) => !chunk.endsWith("...")),
  "School-selection personal context must keep complete chunks instead of hard truncating them.",
);

const validSelection = {
  summary: "该学生适合以工程与应用数学为主线，早申选择控制风险。",
  strategy: {
    earlyStrategy: "ED1 控制在高匹配高意愿学校。",
    ucStrategy: "UC 选择强 CS 与数据科学校区分层覆盖。",
    rdStrategy: "RD 保留冲刺，同时加入城市型匹配校。",
  },
  rounds: {
    rea: [],
    ed1: [school("University of Chicago", "Economics", "high")],
    ed2: [school("New York University", "Business", "medium")],
    ea: [
      school("University of Michigan--Ann Arbor", "Data Science", "medium"),
      school("Georgia Institute of Technology", "Computer Science", "medium"),
      school("University of Illinois Urbana-Champaign", "Statistics", "medium"),
      school("University of Florida", "Data Science", "medium"),
    ],
    rd: [
      school("Harvard University", "Applied Math", "high"),
      school("Princeton University", "Computer Science", "high"),
      school("Cornell University", "Information Science", "medium"),
      school("Duke University", "Economics", "medium"),
      school("Northwestern University", "Data Science", "medium"),
      school("Rice University", "Statistics", "medium"),
      school("Kenyon College", "Creative Writing", "low"),
      school("Northeastern University", "Computer Science", "low"),
    ],
    uc: [
      school("University of California, Berkeley", "Data Science", "high"),
      school("University of California, Los Angeles", "Applied Math", "high"),
      school("University of California, San Diego", "Computer Science", "medium"),
      school("University of California, Irvine", "Software Engineering", "medium"),
      school("University of California, Davis", "Statistics", "low"),
      school("University of California, Santa Barbara", "Data Science", "low"),
    ],
  },
  nextActions: ["补充学校官网截止日期核验", "确认 ED 家庭承诺"],
};

assert.equal(validateSchoolSelectionResult(validSelection).rounds.ed1[0].school, "University of Chicago");
assert.equal(validateSchoolSelectionResult(validSelection).rounds.ed1[0].admissionProbability, "8%-12%");
assert.equal(validateSchoolSelectionResult(validSelection).strategy.earlyStrategy, "ED1 控制在高匹配高意愿学校。");

const repairedUcDuplicate = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    rd: [
      school("University of California, Berkeley", "Data Science", "high"),
      ...validSelection.rounds.rd,
    ],
  },
});
assert.equal(repairedUcDuplicate.rounds.uc.length, 6);
assert.equal(repairedUcDuplicate.rounds.rd.length, 8);
assert.equal(
  repairedUcDuplicate.rounds.rd.some((entry) => entry.school === "University of California, Berkeley"),
  false,
);

const repairedEarlyConflict = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    rea: [school("Princeton University", "Computer Science", "high")],
  },
});
assert.equal(repairedEarlyConflict.rounds.rea.length, 0);
assert.equal(repairedEarlyConflict.rounds.ed1.length, 1);
assert.equal(repairedEarlyConflict.rounds.ed1[0].school, "University of Chicago");

const repairedMissingEarlyChoice = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    ed1: [],
    rd: [
      ...validSelection.rounds.rd,
      school("Carnegie Mellon University", "Computer Science", "high"),
    ],
  },
});
assert.equal(repairedMissingEarlyChoice.rounds.rea.length, 0);
assert.equal(repairedMissingEarlyChoice.rounds.ed1.length, 1);
assert.equal(repairedMissingEarlyChoice.rounds.ed1[0].school, "Carnegie Mellon University");
assert.equal(repairedMissingEarlyChoice.rounds.rd.length, 8);

assert.throws(
  () =>
    validateSchoolSelectionResult({
      ...validSelection,
      rounds: { ...validSelection.rounds, ea: validSelection.rounds.ea.slice(0, 2) },
    }),
  /EA 需要 3-5 所/,
);

assert.throws(
  () =>
    validateSchoolSelectionResult({
      ...validSelection,
      rounds: { ...validSelection.rounds, uc: validSelection.rounds.uc.slice(0, 5) },
    }),
  /UC 需要 6 所/,
);

const repairedRoundDuplicate = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    rd: [
      school("New York University", "Business Analytics", "medium"),
      ...validSelection.rounds.rd,
    ],
  },
});
assert.equal(repairedRoundDuplicate.rounds.ed2[0].school, "New York University");
assert.equal(repairedRoundDuplicate.rounds.rd.length, 8);
assert.equal(
  repairedRoundDuplicate.rounds.rd.some((entry) => entry.school === "New York University"),
  false,
);

const applicationRoundSchools = parseApplicationRoundSchoolsMarkdown(
  readFileSync("data/application-round-schools.md", "utf8"),
);

const repairedUnsupportedEaSchool = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    ea: [
      ...validSelection.rounds.ea.slice(0, 3),
      school("University of Washington", "Computer Science", "high"),
    ],
  },
}, { applicationRoundSchools });
assert.equal(repairedUnsupportedEaSchool.rounds.ea.length, 3);
assert.equal(repairedUnsupportedEaSchool.rounds.rd.length, 9);
assert.equal(
  repairedUnsupportedEaSchool.rounds.ea.some((entry) => entry.school === "University of Washington"),
  false,
);
assert.equal(
  repairedUnsupportedEaSchool.rounds.rd.some((entry) => entry.school === "University of Washington"),
  true,
);
assert.match(
  repairedUnsupportedEaSchool.rounds.rd.find((entry) => entry.school === "University of Washington").gaps.join(" "),
  /已根据申请轮次规则从 EA 调整为 RD/u,
);

const repairedUnsupportedEaSchoolAtMinimum = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    ea: [
      ...validSelection.rounds.ea.slice(0, 2),
      school("University of Washington", "Computer Science", "high"),
    ],
  },
}, { applicationRoundSchools });
assert.equal(repairedUnsupportedEaSchoolAtMinimum.rounds.ea.length, 3);
assert.equal(repairedUnsupportedEaSchoolAtMinimum.rounds.rd.length, 8);
assert.ok(
  repairedUnsupportedEaSchoolAtMinimum.rounds.ea.some((entry) => entry.school === "Northeastern University"),
);
assert.ok(
  repairedUnsupportedEaSchoolAtMinimum.rounds.rd.some((entry) => entry.school === "University of Washington"),
);

const repairedUcDuplicateAtRdMinimum = validateSchoolSelectionResult({
  ...validSelection,
  rounds: {
    ...validSelection.rounds,
    rd: [
      school("University of California, Berkeley", "Data Science", "high"),
      ...validSelection.rounds.rd.slice(0, 7),
    ],
  },
}, { applicationRoundSchools });
assert.equal(repairedUcDuplicateAtRdMinimum.rounds.rd.length, 8);
assert.equal(repairedUcDuplicateAtRdMinimum.rounds.ea.length, 3);
assert.equal(
  repairedUcDuplicateAtRdMinimum.rounds.rd.some((entry) => entry.school === "University of California, Berkeley"),
  false,
);

assert.throws(
  () => validateSchoolSelectionResult({
    ...validSelection,
    rounds: {
      ...validSelection.rounds,
      ed2: [school("Brown University", "Education Studies", "high")],
    },
  }, { applicationRoundSchools }),
  /Brown University.*不支持 ED2/u,
);

assert.throws(
  () =>
    validateSchoolSelectionResult({
      ...validSelection,
      rounds: {
        ...validSelection.rounds,
        ed2: [school("New York University", "", "medium")],
      },
    }),
  /每所学校必须包含专业方向/,
);

const calls = [];
const service = createSchoolSelectionService({
  activityPortfolio: {
    getPortfolio() {
      return {
        applicationPlan: { rea: [], ed1: [], ed2: [], ea: [], uc: [], rd: [], multiCountry: [] },
        activities: [
          {
            activityName: "Robotics Portfolio Lab",
            type: "research",
            outcome: "Demo and technical writeup",
          },
          ...Array.from({ length: 18 }, (_, index) => ({
            activityName: `General service activity ${index + 1}`,
            type: "service",
            description: "Routine event support",
          })),
          {
            activityName: "Capstone Data Equity Lab",
            type: "research",
            description: "Applied Data Science to analyze access gaps across California school districts.",
            outcome: "Published a reproducible equity dashboard.",
          },
        ],
        competitions: [],
        summerSchools: [],
        recommendationLetters: {},
        schoolSelectionVersions: [
          {
            versionName: "Legacy generated version",
            summary: "legacy-summary-marker",
            selectionJson: "legacy-selection-json-marker",
            source: "美本选校系统",
          },
        ],
        academicRecords: {
          gpaScale: "4.0制",
          gpaRecords: [{ gradeLevel: "10年级", term: "上学期", gpa: "3.9" }],
          satTests: [{ totalScore: "1510", englishScore: "730", mathScore: "780" }],
          apExams: [{ courseName: "AP Calculus BC", score: "5", examYear: "2026" }],
        },
      };
    },
  },
  llmClient: createMockSchoolSelectionLlmClient(
    calls,
    (callNumber) => {
      const brokenSelection = {
        ...validSelection,
        rounds: {
          ...validSelection.rounds,
          ea: validSelection.rounds.ea.slice(0, 3),
          rd: validSelection.rounds.rd.slice(0, 7),
        },
      };
      return JSON.stringify(callNumber === 1 ? brokenSelection : validSelection);
    },
  ),
});

const generated = await service.generateSelection({
  user: { id: 1 },
  payload: {
    nationality: "中国",
    highSchoolRegion: "中国大陆高中",
    preferences: "希望申请数据科学和计算机方向。",
    targetMajor: "Data Science",
    budgetSensitivity: "中等",
    regionPreference: "东海岸或加州",
    campusSetting: "城市型",
    schoolSize: "中大型",
    edRiskTolerance: "均衡",
    scholarshipNeed: "不强制",
  },
  env: {
    DEEPSEEK_API_KEY: "school-selection-secret",
    DEEPSEEK_MODEL: "Deepseek V4 pro",
  },
});

assert.equal(generated.selection.rounds.uc.length, 6);
assert.equal(generated.selection.rounds.ea.length, 4);
assert.equal(generated.selection.rounds.ed1[0].admissionProbability, "5%-8%");
assert.match(generated.selection.rounds.ed1[0].gaps.join(" "), /录取友好度为 5\/10/);
assert.equal(
  generated.selection.rounds.ea.find((entry) => entry.school === "University of Illinois Urbana-Champaign").admissionProbability,
  "24%-39%",
);
assert.equal(
  generated.selection.rounds.ea.find((entry) => entry.school === "University of Florida").admissionProbability,
  "14%-21%",
);
assert.match(
  generated.selection.rounds.ea.find((entry) => entry.school === "University of Florida").gaps.join(" "),
  /UF 按 Top30 学校口径保守校准/,
);
assert.equal(
  generated.selection.rounds.uc.find((entry) => entry.school === "University of California, Irvine").admissionProbability,
  "24%-39%",
);
assert.equal(
  generated.selection.rounds.rd.find((entry) => entry.school === "Northeastern University").admissionProbability,
  "46%-62%",
);
assert.equal(
  generated.selection.rounds.rd.find((entry) => entry.school === "Kenyon College").admissionProbability,
  "46%-62%",
);
assert.equal(generated.selectionVersion, "均衡版");
assert.equal(generated.quality.metadata.workflowVersion, SCHOOL_SELECTION_GRAPH_VERSION);
assert.ok(generated.ragSources.some((source) => source.type === "school-encyclopedia"));
assert.ok(generated.ragSources.some((source) => source.type === "knowledge-graph"));
assert.equal(generated.retrieval.mode, "graph-rag-with-constraints");
assert.equal(generated.retrieval.queryPlan.primaryIntent, "school");
assert.ok(generated.retrieval.graph.selectedFacts > 0);
assert.ok(generated.ragSources.filter((source) => source.type === "school-encyclopedia").length <= 8);
assert.ok(generated.retrieval.graph.selectedFacts <= 8);
assert.equal(JSON.stringify(generated).includes("school-selection-secret"), false);

assert.equal(calls.length, 2, "School selection should retry once when the first JSON fails strict validation.");
const sentPayload = calls[0];
assert.equal(sentPayload.model, "deepseek-v4-flash");
assert.equal(sentPayload.maxTokens, 9000);
assert.equal(sentPayload.temperature, 0.2);
assert.match(sentPayload.messages[0].content, /美本选校系统/);
assert.match(sentPayload.messages[0].content, /REA \/ ED1/);
assert.match(sentPayload.messages[0].content, /UC.*6/);
assert.match(sentPayload.messages[0].content, /学术匹配/);
assert.match(sentPayload.messages[0].content, /专业匹配/);
assert.match(sentPayload.messages[0].content, /地区与身份因素/);
assert.match(sentPayload.messages[0].content, /不允许把同一所学校重复放入多个轮次/);
assert.match(sentPayload.messages[0].content, /风险等级定义/);
assert.match(sentPayload.messages[0].content, /admissionProbability/);
assert.match(sentPayload.messages[0].content, /录取概率区间/);
assert.match(sentPayload.messages[0].content, /中国学生录取友好度/);
assert.match(sentPayload.messages[0].content, /友好度低的学校/);
assert.match(sentPayload.messages[0].content, /不是录取承诺/);
assert.match(sentPayload.messages[0].content, /输出 JSON 前/);
assert.match(sentPayload.messages[1].content, /中国/);
assert.match(sentPayload.messages[1].content, /中国大陆高中/);
assert.match(sentPayload.messages[1].content, /目标专业\/方向/);
assert.match(sentPayload.messages[1].content, /Data Science/);
assert.match(sentPayload.messages[1].content, /ED 风险承受度/);
assert.match(sentPayload.messages[1].content, /均衡/);
assert.match(sentPayload.messages[1].content, /Robotics Portfolio Lab/);
assert.match(
  sentPayload.messages[1].content,
  /Capstone Data Equity Lab/,
  "School-selection RAG must select a later portfolio chunk that matches the current major and region constraints.",
);
assert.match(sentPayload.messages[1].content, /1510/);
assert.doesNotMatch(sentPayload.messages[1].content, /legacy-selection-json-marker/);
assert.match(sentPayload.messages[1].content, /院校百科 RAG 参考/);
assert.match(sentPayload.messages[1].content, /graph-rag-with-constraints/);
assert.match(sentPayload.messages[1].content, /graph_traversal.*document_retrieval.*constraint_validation/);
assert.match(sentPayload.messages[1].content, /University of California|UC/);
assert.match(sentPayload.messages[1].content, /先判断学生整体竞争力/);
assert.match(sentPayload.messages[1].content, /如果信息不足，明确写入 gaps/);
const retryPayload = calls[1];
assert.equal(retryPayload.temperature, 0.1);
assert.match(retryPayload.messages[1].content, /上一次输出未通过二次校验/);
assert.match(retryPayload.messages[1].content, /RD 需要 8-12 所/);
assert.match(retryPayload.messages[1].content, /当前轮次数量：REA\/ED1 1，ED2 1，EA 3，RD 7，UC 6/);
assert.match(retryPayload.messages[1].content, /上一次需要修复的完整选校结果/);
assert.match(retryPayload.messages[1].content, /Harvard University/);

const incompleteProfileService = createSchoolSelectionService({
  activityPortfolio: {
    getPortfolio() {
      return {};
    },
  },
  llmClient: createMockSchoolSelectionLlmClient([], () => JSON.stringify(validSelection)),
});
const incompleteProfileResult = await incompleteProfileService.generateSelection({
  user: { id: 2 },
  payload: {
    nationality: "中国",
    highSchoolRegion: "中国大陆高中",
  },
  env: { DEEPSEEK_API_KEY: "school-selection-secret" },
});
const incompleteProfileSchools = Object.values(incompleteProfileResult.selection.rounds).flat();
assert.ok(incompleteProfileSchools.length > 0);
assert.ok(incompleteProfileSchools.every((entry) => entry.admissionProbability === "资料不足，暂不估算"));
assert.ok(incompleteProfileSchools.every((entry) => entry.gaps.some((gap) => /补充.*GPA.*课程.*活动/u.test(gap))));

assert.match(sentPayload.messages[0].content, /Top30/);
assert.match(sentPayload.messages[0].content, /Top30 之后/);
assert.match(sentPayload.messages[0].content, /不要把 Top30 的极低概率口径套用到所有学校/);
assert.match(sentPayload.messages[0].content, /低估/);
assert.match(sentPayload.messages[0].content, /概率应显著下调/);
assert.match(sentPayload.messages[0].content, /University of Florida \/ UF/);
assert.match(sentPayload.messages[0].content, /15%-20% 上调/);
assert.match(sentPayload.messages[0].content, /再次上调 15%/);
assert.match(sentPayload.messages[0].content, /University of California, Santa Barbara/);
assert.match(sentPayload.messages[0].content, /Union College/);

function school(name, major, riskLevel) {
  return {
    school: name,
    major,
    riskLevel,
    admissionProbability: riskLevel === "high" ? "8%-12%" : riskLevel === "medium" ? "18%-28%" : "35%-45%",
    matchReason: `${name} 与当前档案方向匹配。`,
    gaps: ["核验截止日期", "补充官网要求"],
    nextAction: "核验官网并完善材料清单。",
  };
}

function createMockSchoolSelectionLlmClient(callLog, getContent) {
  return {
    async invoke(options) {
      callLog.push({
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        messages: options.messages,
        signal: options.signal,
      });
      const content = getContent(callLog.length, options);
      if (content instanceof Error) throw content;
      return {
        content,
        model: options.model,
      };
    },
  };
}
