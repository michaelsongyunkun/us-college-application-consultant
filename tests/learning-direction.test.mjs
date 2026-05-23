import assert from "node:assert/strict";
import { buildFutureLearningDirection, futureLearningLength } from "../learning-direction.mjs";

const direction = buildFutureLearningDirection({
  profile: {
    majorDirection: "计算机 / AI / 数学",
    coreStrengths: "Python、数学建模、公益组织",
    interests: "人工智能教育公益",
  },
  activities: [
    {
      type: "学术突破",
      activityName: "AI 教育公益研究",
      executionDescription: "用 Python 开发数据工具，后续形成研究报告",
      suggestedGrade: "10-11",
    },
    {
      type: "社团领导",
      activityName: "AI 学习社",
      executionDescription: "组织工作坊和志愿教学",
      suggestedGrade: "10",
    },
  ],
  narrative: "以 AI 教育公益为主线，结合科研、项目开发和社区影响。",
});

assert.ok(direction.includes("Python"));
assert.ok(direction.includes("项目"));
assert.ok(direction.includes("学习档案"));
assert.ok(futureLearningLength(direction) >= 150);
assert.ok(futureLearningLength(direction) <= 250);

assert.equal(
  buildFutureLearningDirection({
    profile: {},
    activities: [],
    narrative: "",
  }),
  "",
);
