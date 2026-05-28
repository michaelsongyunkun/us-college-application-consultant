import assert from "node:assert/strict";
import { analyzeActivityQuality } from "../src/domain/activity-quality-checker.mjs";

const emptyResult = analyzeActivityQuality();
assert.equal(emptyResult.score, 0);
assert.equal(emptyResult.statusLabel, "等待活动内容");
assert.equal(emptyResult.metrics.completedCount, 0);
assert.match(emptyResult.issues[0], /还没有可检查/);

const strongActivities = Array.from({ length: 10 }, (_, index) => ({
  id: index + 1,
  type: index < 5 ? "学术研究" : index < 8 ? "领导力/服务" : "个人项目",
  activityName:
    index === 0
      ? "计算物理研究项目"
      : index === 5
        ? "社区物理科普工作坊负责人"
        : `物理方向活动 ${index + 1}`,
  executionDescription:
    index === 0
      ? "主导计算物理研究，使用 Python 处理 10000 个数据点，完成模型并将误差降低 15%，形成论文成果。"
      : index === 5
        ? "发起社区公益科普项目，组织 6 名成员服务 120 人次，帮助学生理解声学和力学实验。"
        : `带领团队完成第 ${index + 1} 项物理相关项目，组织 8 名成员，完成成果展示并影响 50 人。`,
  suggestedGrade: index < 3 ? "9" : index < 6 ? "10" : index < 8 ? "11" : "12",
}));

const strongResult = analyzeActivityQuality({
  profile: { majorDirection: "物理", interests: "计算物理 科普" },
  activities: strongActivities,
});
assert.equal(strongResult.metrics.completedCount, 10);
assert.ok(strongResult.score >= 80);
assert.match(strongResult.statusLabel, /结构稳健/);
assert.ok(strongResult.strengths.some((item) => item.includes("10 项活动")));

const weakResult = analyzeActivityQuality({
  profile: { majorDirection: "物理" },
  activities: [
    { id: 1, type: "活动", activityName: "社团", executionDescription: "参加社团", suggestedGrade: "" },
    { id: 2, type: "活动", activityName: "社团", executionDescription: "参加社团", suggestedGrade: "" },
    { id: 3, type: "活动", activityName: "比赛", executionDescription: "参加比赛", suggestedGrade: "11" },
  ],
});
assert.equal(weakResult.metrics.duplicateNameCount, 1);
assert.ok(weakResult.score < 60);
assert.ok(weakResult.issues.some((item) => item.includes("数字证据")));
assert.ok(weakResult.issues.some((item) => item.includes("重复")));
assert.ok(weakResult.activityNotes.some((item) => item.notes.some((note) => note.includes("描述偏短"))));
