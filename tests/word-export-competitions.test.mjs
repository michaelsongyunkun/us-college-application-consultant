import assert from "node:assert/strict";
import { buildWordDocument } from "../src/domain/word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "10年级", majorDirection: "计算机 / 数学" },
  activities: [],
  narrative: "",
  competitionRecommendations: [
    {
      name: "USACO Bronze / Silver / Gold / Platinum",
      recommendationType: "学科强相关",
      recommendationReason: "与当前学生的计算机方向匹配度较高。",
      applicationHelp: "有助于证明算法能力。",
      prepTime: "建议预留 6-12 个月准备",
      url: "http://usaco.org",
      rating: "A",
    },
  ],
});

assert.ok(documentHtml.includes("国际竞赛推荐"));
assert.ok(documentHtml.includes("USACO Bronze / Silver / Gold / Platinum"));
assert.ok(documentHtml.includes("http://usaco.org"));
assert.ok(documentHtml.includes("含金量评级"));
assert.ok(documentHtml.includes(">A<"));
