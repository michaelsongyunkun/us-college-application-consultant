import assert from "node:assert/strict";
import { buildWordDocument } from "../word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "10年级", interests: "AI教育公益" },
  activities: [
    {
      id: 1,
      type: "学术突破",
      activityName: "AI教育公益研究",
      executionDescription: "问题：资源不足\n成果：完成工具\n影响：服务80人",
      suggestedGrade: "10-11",
    },
  ],
  narrative: "以AI教育公益为Spike。",
});

assert.ok(documentHtml.includes("<title>"));
assert.ok(documentHtml.includes("AI教育公益研究"));
assert.ok(documentHtml.includes("<p>问题：资源不足</p>"));
assert.ok(documentHtml.includes("<p>成果：完成工具</p>"));
assert.ok(documentHtml.includes("<p>影响：服务80人</p>"));
assert.ok(documentHtml.includes("以AI教育公益为Spike。"));
