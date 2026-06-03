import assert from "node:assert/strict";
import {
  createSchoolSelectionService,
  validateSchoolSelectionResult,
} from "../src/server/school-selection-service.mjs";

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
    ],
    rd: [
      school("Harvard University", "Applied Math", "high"),
      school("Princeton University", "Computer Science", "high"),
      school("Cornell University", "Information Science", "medium"),
      school("Duke University", "Economics", "medium"),
      school("Northwestern University", "Data Science", "medium"),
      school("Rice University", "Statistics", "medium"),
      school("Boston University", "Business Analytics", "low"),
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
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    const brokenSelection = {
      ...validSelection,
      rounds: { ...validSelection.rounds, ea: validSelection.rounds.ea.slice(0, 2) },
    };
    const content = calls.length === 1 ? JSON.stringify(brokenSelection) : JSON.stringify(validSelection);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

assert.equal(generated.selection.rounds.uc.length, 6);
assert.equal(generated.selection.rounds.ea.length, 3);
assert.equal(generated.selectionVersion, "均衡版");
assert.ok(generated.ragSources.some((source) => source.type === "school-encyclopedia"));
assert.equal(JSON.stringify(generated).includes("school-selection-secret"), false);

assert.equal(calls.length, 2, "School selection should retry once when the first JSON fails strict validation.");
assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
assert.equal(calls[0].options.headers.Authorization, "Bearer school-selection-secret");
const sentPayload = JSON.parse(calls[0].options.body);
assert.equal(sentPayload.model, "deepseek-v4-flash");
assert.equal(sentPayload.stream, false);
assert.deepEqual(sentPayload.thinking, { type: "disabled" });
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
assert.match(sentPayload.messages[0].content, /不是录取承诺/);
assert.match(sentPayload.messages[0].content, /输出 JSON 前/);
assert.match(sentPayload.messages[1].content, /中国/);
assert.match(sentPayload.messages[1].content, /中国大陆高中/);
assert.match(sentPayload.messages[1].content, /目标专业\/方向/);
assert.match(sentPayload.messages[1].content, /Data Science/);
assert.match(sentPayload.messages[1].content, /ED 风险承受度/);
assert.match(sentPayload.messages[1].content, /均衡/);
assert.match(sentPayload.messages[1].content, /Robotics Portfolio Lab/);
assert.match(sentPayload.messages[1].content, /1510/);
assert.doesNotMatch(sentPayload.messages[1].content, /legacy-selection-json-marker/);
assert.match(sentPayload.messages[1].content, /院校百科 RAG 参考/);
assert.match(sentPayload.messages[1].content, /University of California|UC/);
assert.match(sentPayload.messages[1].content, /先判断学生整体竞争力/);
assert.match(sentPayload.messages[1].content, /如果信息不足，明确写入 gaps/);
const retryPayload = JSON.parse(calls[1].options.body);
assert.match(retryPayload.messages[1].content, /上一次输出未通过二次校验/);
assert.match(retryPayload.messages[1].content, /EA 需要 3-5 所/);

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
