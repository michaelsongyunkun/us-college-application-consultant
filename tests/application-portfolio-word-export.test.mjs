import assert from "node:assert/strict";
import { buildApplicationPortfolioWordDocument } from "../src/domain/word-export.mjs";

const documentHtml = buildApplicationPortfolioWordDocument({
  portfolio: {
    applicationPlan: {
      rea: [{ school: "Princeton University", major: "Computer Science" }],
      ed1: [],
      ed2: [{ school: "New York University", major: "Business" }],
      ea: [{ school: "Massachusetts Institute of Technology", major: "Electrical Engineering" }],
      uc: [{ school: "University of California, Los Angeles", major: "Applied Math" }],
      rd: [{ school: "Harvard University", major: "History" }],
    },
    activities: [
      {
        activityName: "社区科普社",
        type: "公益",
        timeStage: "10年级",
        role: "负责人",
        description: "组织社区科学工作坊",
        outcome: "覆盖80名学生",
        proofLink: "https://example.com/activity",
        status: "已完成",
      },
    ],
    competitions: [
      {
        competitionName: "Physics Bowl",
        subject: "物理",
        yearGrade: "11年级",
        award: "Regional Top 10",
        contribution: "个人参赛",
        proofLink: "https://example.com/competition",
        status: "已获奖",
      },
    ],
    summerSchools: [
      {
        programName: "YYGS",
        organizer: "Yale",
        direction: "Politics",
        participationTime: "2025夏",
        status: "已录取",
        output: "政策brief",
        proofLink: "https://example.com/summer",
      },
    ],
    recommendationLetters: {
      counselorStatus: "已约沟通",
      teacher1: {
        subject: "英语",
        teacherName: "Ms. Carter",
        relationshipStrength: "强",
        materials: "简历、活动清单",
      },
      teacher2: {
        subject: "物理",
        teacherName: "Mr. Lee",
        relationshipStrength: "中",
        materials: "项目说明",
      },
      outsideRecommender: {
        identity: "实验室导师",
        relationship: "暑期科研导师",
        scenario: "补充推荐信",
      },
      preparedMaterials: ["简历", "活动清单", "项目说明"],
      notes: "<script>alert('x')</script>",
    },
  },
  exportedAt: new Date("2026-05-28T08:00:00.000Z"),
});

assert.ok(documentHtml.includes("<title>我的申请</title>"));
assert.ok(documentHtml.includes("选校计划"));
assert.ok(documentHtml.includes("Princeton University"));
assert.ok(documentHtml.includes("Computer Science"));
assert.ok(documentHtml.includes("社区科普社"));
assert.ok(documentHtml.includes("Physics Bowl"));
assert.ok(documentHtml.includes("YYGS"));
assert.ok(documentHtml.includes("Ms. Carter"));
assert.ok(documentHtml.includes("简历、活动清单、项目说明"));
assert.ok(!documentHtml.includes("<script>alert('x')</script>"));
assert.ok(documentHtml.includes("&lt;script&gt;alert('x')&lt;/script&gt;"));
