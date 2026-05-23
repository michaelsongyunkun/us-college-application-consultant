import assert from "node:assert/strict";
import { buildWordDocument } from "../word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "11年级" },
  activities: [
    {
      id: 1,
      type: "学术项目",
      activityName: "公共史研究",
      executionDescription: "- **问题**：地方史资料分散\n- **成果**：完成访谈整理\n- **影响**：形成校内展览",
      suggestedGrade: "11年级",
    },
  ],
  narrative: "",
});

assert.ok(documentHtml.includes("<ul>"));
assert.ok(documentHtml.includes("<strong>问题</strong>"));
assert.ok(documentHtml.includes("地方史资料分散"));
