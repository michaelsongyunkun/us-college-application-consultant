import assert from "node:assert/strict";
import {
  createSchoolSelectionService,
  validateSchoolSelectionResult,
} from "../src/server/school-selection-service.mjs";

const validSelection = {
  summary: "该学生适合以工程与应用数学为主线，早申选择控制风险。",
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

assert.throws(
  () =>
    validateSchoolSelectionResult({
      ...validSelection,
      rounds: {
        ...validSelection.rounds,
        rea: [school("Princeton University", "Computer Science", "high")],
      },
    }),
  /REA \/ ED1 只能二选一且合计 1 所/,
);

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

const calls = [];
const service = createSchoolSelectionService({
  activityPortfolio: {
    getPortfolio() {
      return {
        applicationPlan: { rea: [], ed1: [], ed2: [], ea: [], uc: [], rd: [] },
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
  },
  env: {
    DEEPSEEK_API_KEY: "school-selection-secret",
    DEEPSEEK_MODEL: "deepseek-v4-pro",
  },
  deepSeekFetch: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(validSelection) } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

assert.equal(generated.selection.rounds.uc.length, 6);
assert.equal(generated.selection.rounds.ea.length, 3);
assert.equal(JSON.stringify(generated).includes("school-selection-secret"), false);

assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
assert.equal(calls[0].options.headers.Authorization, "Bearer school-selection-secret");
const sentPayload = JSON.parse(calls[0].options.body);
assert.equal(sentPayload.model, "deepseek-v4-pro");
assert.equal(sentPayload.stream, false);
assert.deepEqual(sentPayload.thinking, { type: "disabled" });
assert.match(sentPayload.messages[0].content, /美本选校系统/);
assert.match(sentPayload.messages[0].content, /REA \/ ED1/);
assert.match(sentPayload.messages[0].content, /UC.*6/);
assert.match(sentPayload.messages[1].content, /中国/);
assert.match(sentPayload.messages[1].content, /中国大陆高中/);
assert.match(sentPayload.messages[1].content, /Robotics Portfolio Lab/);
assert.match(sentPayload.messages[1].content, /1510/);

function school(name, major, riskLevel) {
  return {
    school: name,
    major,
    riskLevel,
    matchReason: `${name} 与当前档案方向匹配。`,
    gaps: ["核验截止日期", "补充官网要求"],
    nextAction: "核验官网并完善材料清单。",
  };
}
