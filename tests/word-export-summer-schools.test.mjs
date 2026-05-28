import assert from "node:assert/strict";
import { buildWordDocument } from "../src/domain/word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "10年级", majorDirection: "AI / 数学" },
  activities: [],
  narrative: "",
  summerSchoolRecommendations: [
    {
      name: "SUMaC",
      tier: "冲刺型",
      rating: "S",
      category: "数学方向",
      reason: "与当前学生的数学方向匹配。",
      formatAndWebsite: "线下(Stanford) 官网：sumac.stanford.edu",
      admissionRate: "约 7%–10%",
      requirements: ["10–11 年级", "Admission Exam"],
      programTime: "7 月 – 8 月",
      applicationTime: "12 月初截止",
    },
  ],
});

assert.ok(documentHtml.includes("夏校推荐"));
assert.ok(documentHtml.includes("SUMaC"));
assert.ok(documentHtml.includes("冲刺型"));
