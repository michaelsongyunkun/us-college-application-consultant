import assert from "node:assert/strict";
import { buildWordDocument } from "../src/domain/word-export.mjs";

const documentHtml = buildWordDocument({
  profile: { grade: "10年级", interests: "AI 教育公益" },
  activities: [],
  narrative: "",
  caseMatches: [
    {
      case: {
        admission: "UCLA 加州大学洛杉矶分校",
        major: "计算机数学",
        academics: "雅思 8.0、ACT 36",
        awards: "物理碗金奖、SCI 论文",
        activities: "机器人公益教学",
      },
      matchReason: "该案例与当前学生在计算机/AI/数学方面有较高重合。",
      takeaway: "后续可重点参考其科研产出、竞赛成果的积累方式。",
    },
  ],
});

assert.ok(documentHtml.includes("相似录取案例参考"));
assert.ok(documentHtml.includes("UCLA 加州大学洛杉矶分校"));
assert.ok(documentHtml.includes("后续可重点参考其科研产出、竞赛成果的积累方式。"));
