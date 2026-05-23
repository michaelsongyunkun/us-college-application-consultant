import assert from "node:assert/strict";
import { buildWordDocument } from "../word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "11年级", majorDirection: "历史 / 人文社科" },
  activities: [],
  narrative: "",
  recommendationLetterStrategy: {
    notice: "建议优先准备 3 封校内推荐信。",
    items: [
      {
        role: "校内 Counselor 推荐信",
        recommenderType: "Counselor / 升学指导老师",
        priority: "必备",
        recommendationFocus: "呈现整体成长轨迹。",
        evidence: "规划表中的历史研究项目。",
        preparationAdvice: "准备 brag sheet。",
      },
    ],
  },
});

assert.ok(documentHtml.includes("推荐信推荐"));
assert.ok(documentHtml.includes("校内 Counselor 推荐信"));
assert.ok(documentHtml.includes("Counselor / 升学指导老师"));
