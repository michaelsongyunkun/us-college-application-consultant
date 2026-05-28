import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const pageHtml = readFileSync("my-activities.html", "utf8");
const script = readFileSync("src/client/my-activities.js", "utf8");
const styles = readFileSync("styles.css", "utf8");
const navigation = indexHtml.match(/<nav class="title-link-group"[\s\S]*?<\/nav>/)?.[0] || "";

assert.ok(navigation.includes('href="./my-activities.html"'), "主导航应包含我的课外活动入口。");
assert.ok(
  navigation.indexOf("申请规划") < navigation.indexOf("my-activities.html")
    && navigation.indexOf("my-activities.html") < navigation.indexOf("resource-library.html"),
  "我的课外活动应与申请规划 / 资源库 / 院校百科同级，并位于资源库前。"
);

for (const expected of [
  "我的课外活动",
  "整理你已经完成或正在准备的活动、竞赛、夏校和推荐信材料，作为后续规划与申请复盘的基础。",
  'id="portfolioForm"',
  'id="savePortfolioButton"',
  'id="portfolioStatus"',
  'id="activityImportSources"',
  'id="activityImportStatus"',
  'id="activitiesList"',
  'id="competitionsList"',
  'id="summerSchoolsList"',
  'id="recommendationLettersPanel"',
  'id="activitiesProgress"',
  'id="competitionsProgress"',
  'id="summerSchoolsProgress"',
  'id="recommendationProgress"',
]) {
  assert.ok(pageHtml.includes(expected), `Missing my-activities page element or copy: ${expected}`);
}

for (const copy of [
  "课外活动：已填写 0/10",
  "竞赛：已填写 0/5",
  "夏校：已填写 0/3",
  "推荐信：待补充",
]) {
  assert.ok(pageHtml.includes(copy) || script.includes(copy), `完成度文案应覆盖空状态：${copy}`);
}

for (const field of [
  "activityName",
  "timeStage",
  "role",
  "outcome",
  "competitionName",
  "yearGrade",
  "award",
  "programName",
  "organizer",
  "counselorStatus",
  "preparedMaterials",
]) {
  assert.ok(script.includes(field), `Script should render or collect ${field}.`);
}

assert.match(script, /const ACTIVITY_SLOT_COUNT = 10/);
assert.match(script, /const COMPETITION_SLOT_COUNT = 5/);
assert.match(script, /const SUMMER_SCHOOL_SLOT_COUNT = 3/);
assert.ok(script.includes('"/api/my-activities"'), "页面脚本应读取和保存 /api/my-activities。");
assert.ok(
  script.includes('"/api/my-activities/import-sources"'),
  "页面脚本应读取申请规划活动导入源。"
);
assert.ok(script.includes("data-import-activity"), "单个规划活动应提供导入按钮。");
assert.ok(script.includes("mapPlanningActivityToPortfolio"), "导入时应映射规划活动字段。");
assert.ok(script.includes("beforeunload"), "有未保存修改时应拦截离开页面。");
assert.ok(script.includes("有未保存修改"), "页面应显示脏状态文案。");
assert.ok(script.includes("已保存"), "页面应显示保存成功文案。");
assert.ok(!script.includes("AI 推荐"), "空状态不应渲染 AI 编造内容。");
assert.match(styles, /\.portfolio-grid\s*\{/, "我的课外活动页面应有专用布局样式。");
assert.match(styles, /\.portfolio-card\s*\{/, "履历条目应使用专用卡片样式。");
