import assert from "node:assert/strict";
import { buildRecommendationLetterStrategy } from "../src/domain/recommendation-letter-recommender.mjs";

const profile = {
  grade: "11年级",
  majorDirection: "计算机 / AI",
  interests: "人工智能、数学建模、教育公益",
  availableResources: "有一位大学教授可以指导科研项目",
};

const activities = [
  {
    id: 1,
    type: "学术项目",
    activityName: "AI 教育公益研究",
    executionDescription: "使用 Python 开发学习工具，并形成研究报告",
    suggestedGrade: "11年级",
  },
];

const strategy = buildRecommendationLetterStrategy({
  profile,
  activities,
  narrative: "后续规划包含科研论文和教授指导。",
});

assert.equal(strategy.ready, true);
assert.equal(strategy.items.length, 4);
assert.equal(strategy.items[0].role, "校内 Counselor 推荐信");
assert.ok(strategy.items[1].recommenderType.includes("计算机"));
assert.equal(strategy.items[2].recommenderType, "文社艺术科老师");
assert.equal(strategy.items[3].role, "校外推荐信");

const humanitiesStrategy = buildRecommendationLetterStrategy({
  profile: {
    grade: "11年级",
    majorDirection: "历史 / 人文社科",
    interests: "世界史、公共写作",
  },
  activities,
  narrative: "",
});

assert.equal(humanitiesStrategy.ready, true);
assert.equal(humanitiesStrategy.items.length, 3);
assert.equal(humanitiesStrategy.items[2].recommenderType, "STEM 类学科老师");
assert.ok(humanitiesStrategy.notice.includes("3 封"));

const missingPlan = buildRecommendationLetterStrategy({
  profile,
  activities: [],
  narrative: "",
});

assert.equal(missingPlan.ready, false);
assert.deepEqual(missingPlan.items, []);
assert.ok(missingPlan.notice.includes("用户背景输入"));

const missingProfile = buildRecommendationLetterStrategy({
  profile: {},
  activities,
  narrative: "",
});

assert.equal(missingProfile.ready, false);
assert.deepEqual(missingProfile.items, []);
