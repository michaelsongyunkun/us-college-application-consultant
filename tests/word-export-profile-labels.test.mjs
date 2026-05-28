import assert from "node:assert/strict";
import { buildWordDocument } from "../src/domain/word-export.mjs";

const documentHtml = buildWordDocument({
  profile: {
    grade: "11 年级",
    majorDirection: "未定",
    schoolContext: "非美高（中国大陆高中）",
    identityDescription: "无美国公民或永久居民身份",
    coreStrengths: "数学很好",
    availableResources: "校内社团",
    personality: "外向",
    interests: "数学 + 经济",
    existingActivities: "校内活动",
  },
  activities: [],
  narrative: "",
});

assert.ok(documentHtml.includes("<th>年级</th>"));
assert.ok(documentHtml.includes("<th>专业方向</th>"));
assert.ok(documentHtml.includes("<th>当前就读体系（项目资格筛选）</th>"));
assert.ok(documentHtml.includes("<th>美国身份条件（项目资格筛选）</th>"));
assert.ok(documentHtml.includes("<th>核心能力 / 特长</th>"));
assert.ok(documentHtml.includes("<th>可利用资源</th>"));
assert.ok(documentHtml.includes("<th>性格 / 行为倾向</th>"));
assert.ok(documentHtml.includes("<th>兴趣方向</th>"));
assert.ok(documentHtml.includes("<th>现有课外活动</th>"));
assert.ok(!documentHtml.includes("<th>grade</th>"));
assert.ok(!documentHtml.includes("<th>majorDirection</th>"));
