import assert from "node:assert/strict";
import { buildWordDocument } from "../word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "10年级", majorDirection: "AI / 数学" },
  activities: [],
  narrative: "以 AI 教育公益为主线。",
  futureLearningDirection: "未来应学习 Python、数据分析和项目管理，并建立学习档案。",
});

assert.ok(documentHtml.includes("未来学习方向"));
assert.ok(documentHtml.includes("未来应学习 Python、数据分析和项目管理"));
