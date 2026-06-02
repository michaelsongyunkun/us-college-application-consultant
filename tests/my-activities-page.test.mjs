import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const pageHtml = readFileSync("my-activities.html", "utf8");
const script = readFileSync("src/client/my-activities.js", "utf8");
const styles = readFileSync("styles.css", "utf8");
const navigation = indexHtml.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.ok(navigation.includes('href="./my-activities.html"'), "左侧导航应包含我的申请入口。");
assert.ok(
  navigation.indexOf("申请规划中心") < navigation.indexOf("my-activities.html")
    && navigation.indexOf("my-activities.html") < navigation.indexOf("resource-library.html"),
  "我的申请应与申请规划中心 / 资源库 / 院校百科同级，并位于资源库前。"
);

for (const expected of [
  "我的申请",
  "整理 GPA、SAT、AP、选校计划、活动、竞赛、夏校和推荐信材料，作为后续申请复盘的基础。",
  'id="portfolioForm"',
  'id="savePortfolioButton"',
  'id="exportPortfolioSvgButton"',
  'id="exportPortfolioWordButton"',
  'id="clearPortfolioButton"',
  'id="portfolioStatus"',
  'id="portfolioCompletionPanel"',
  'id="portfolioCompletionGrid"',
  'id="portfolioCompletionAcademic"',
  'id="portfolioCompletionActivities"',
  'id="portfolioCompletionSchoolPlan"',
  'id="portfolioCompletionDeepSeek"',
  'id="academicRecordsProgress"',
  'id="gpaRecordsList"',
  'id="satTestsList"',
  'id="apExamsList"',
  'id="applicationPlanList"',
  'id="applicationPlanProgress"',
  'id="activityImportSources"',
  'id="activityImportStatus"',
  'id="activitiesList"',
  'id="competitionsList"',
  'id="summerSchoolsList"',
  'id="recommendationLettersPanel"',
  'id="planningActionsPanel"',
  'id="deepSeekNotesPanel"',
  'id="planningActionsProgress"',
  'id="activitiesProgress"',
  'id="competitionsProgress"',
  'id="summerSchoolsProgress"',
  'id="recommendationProgress"',
]) {
  assert.ok(pageHtml.includes(expected), `Missing my-activities page element or copy: ${expected}`);
}

assert.ok(
  pageHtml.indexOf('id="academicRecordsProgress"') < pageHtml.indexOf('id="activityImportSources"')
    && pageHtml.indexOf('id="activityImportSources"') < pageHtml.indexOf('id="activitiesList"'),
  "成绩与考试模块应位于我的申请页面最开始、规划导入模块之前。"
);

assert.ok(
  pageHtml.indexOf('id="recommendationLettersPanel"') < pageHtml.indexOf('id="planningActionsPanel"')
    && pageHtml.indexOf('id="planningActionsPanel"') < pageHtml.indexOf('id="deepSeekNotesPanel"')
    && pageHtml.indexOf('id="deepSeekNotesPanel"') < pageHtml.indexOf('id="applicationPlanList"')
    && pageHtml.indexOf('id="applicationPlanList"') < pageHtml.indexOf('class="portfolio-save-bar"'),
  "DeepSeek 产出应位于推荐信与选校计划之间，选校计划仍靠近保存栏。"
);

for (const copy of [
  "选校计划：已填写 0 所",
  "成绩档案：GPA 8 学期 / SAT 0 次 / AP 0 门",
  "课外活动：已填写 0/10",
  "竞赛：已填写 0/5",
  "夏校：已填写 0/3",
  "推荐信：待补充",
  "DeepSeek 行动：0 项",
]) {
  assert.ok(pageHtml.includes(copy) || script.includes(copy), `完成度文案应覆盖空状态：${copy}`);
}

assert.ok(
  pageHtml.indexOf('id="portfolioCompletionPanel"') < pageHtml.indexOf('id="academicRecordsProgress"'),
  "Application portfolio should show a completion guide before the detailed form sections.",
);
assert.ok(script.includes("renderPortfolioCompletion"), "Portfolio page should refresh the completion guide from saved data.");
for (const selector of [".portfolio-completion-panel", ".portfolio-completion-grid", ".portfolio-completion-card"]) {
  assert.ok(styles.includes(selector), `Stylesheet should define ${selector}.`);
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
  "applicationPlan",
  "planningActions",
  "deepSeekNotes",
  "renderPlanningActions",
  "renderDeepSeekNotes",
  "academicRecords",
  "GPA分制",
  "4.0分制",
  "100分制",
  "4.3分制",
  "5分制",
  "renderAcademicRecords",
  "data-add-academic-record",
  "data-remove-academic-record",
  "AP_COURSE_OPTIONS",
  "AP Calculus BC（微积分 BC）",
  "SAT总分",
  "英文分数",
  "数学分数",
  "考试日期",
  "考试年份",
  "renderApplicationPlan",
  "data-add-application-round",
  "data-remove-application-round",
  "application-round-schools.md",
  "enforceEarlyBindingExclusivity",
  "removeApplicationRound",
]) {
  assert.ok(script.includes(field), `Script should render or collect ${field}.`);
}

assert.match(script, /const ACTIVITY_SLOT_COUNT = 10/);
assert.match(script, /const COMPETITION_SLOT_COUNT = 5/);
assert.match(script, /const SUMMER_SCHOOL_SLOT_COUNT = 3/);
assert.match(script, /const GPA_DEFAULT_RECORDS/);
assert.equal(
  [...script.matchAll(/"AP [^"]+（[^"]+）"/g)].filter((match) =>
    script.slice(script.lastIndexOf("const AP_COURSE_OPTIONS"), script.indexOf("];", script.lastIndexOf("const AP_COURSE_OPTIONS"))).includes(match[0]),
  ).length,
  40,
  "AP 课程下拉应包含本地 AP 资料库中的 40 门课程。"
);
assert.ok(script.includes('"/api/my-activities"'), "页面脚本应读取和保存 /api/my-activities。");
assert.ok(
  script.includes('"/api/my-activities/import-sources"'),
  "页面脚本应读取申请规划活动导入源。"
);
assert.ok(script.includes("data-import-activity"), "单个规划活动应提供导入按钮。");
assert.ok(script.includes("mapPlanningActivityToPortfolio"), "导入时应映射规划活动字段。");
assert.ok(script.includes("insertEntryIntoFirstEmptySlot"), "导入时应优先填入当前页面第一个空活动槽位。");
assert.ok(script.includes("collectEntrySlots"), "导入前应保留当前 10 个可见活动槽位，避免删除后索引压缩。");
assert.match(
  script,
  /from "\.\.\/domain\/agent-output-parser\.mjs\?v=20260531-import-visual-text"/,
  "申请规划导入区应复用 Markdown 转可视化文本清洗逻辑。",
);
assert.match(script, /cleanPlanningActivityText/, "申请规划导入区应清洗 Markdown 标记。");
assert.doesNotMatch(
  script,
  /<h3>\$\{escapeHtml\(activity\.activityName/,
  "导入卡片标题不应直接渲染 Markdown 原文。",
);
assert.doesNotMatch(
  script,
  /<p>\$\{escapeHtml\(activity\.description/,
  "导入卡片描述不应直接渲染 Markdown 原文。",
);
assert.ok(script.includes("beforeunload"), "有未保存修改时应拦截离开页面。");
assert.ok(script.includes("有未保存修改"), "页面应显示脏状态文案。");
assert.ok(script.includes("已保存"), "页面应显示保存成功文案。");
assert.ok(!script.includes("AI 推荐"), "空状态不应渲染 AI 编造内容。");
assert.ok(
  pageHtml.includes("./styles.css?v=20260602-major-dropdown")
    && pageHtml.includes("./src/client/my-activities.js?v=20260601-portfolio-versions-v2"),
  "我的申请页面应更新 CSS / JS 版本号，避免用户继续加载缓存的旧工作流。"
);
assert.match(styles, /\.portfolio-grid\s*\{/, "我的课外活动页面应有专用布局样式。");
assert.match(styles, /\.portfolio-card\s*\{/, "履历条目应使用专用卡片样式。");
assert.match(
  styles,
  /\.portfolio-completion-card:visited\s*\{[\s\S]*?color:\s*#26374f;/,
  "Portfolio completion cards should override visited link colors.",
);
assert.match(
  styles,
  /\.dashboard-task-card\s+\*,\s*\.portfolio-completion-card\s+\*\s*\{[\s\S]*?text-decoration:\s*none;/,
  "Portfolio completion card descendants should never inherit underlined link styling.",
);
assert.match(styles, /\.application-plan-grid\s*\{/, "我的申请页面应有选校计划布局样式。");
assert.match(
  styles,
  /\.application-plan-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "选校计划轮次卡片应垂直排列为单列。"
);
assert.match(
  styles,
  /\.application-plan-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s*minmax\(0,\s*0\.95fr\)/,
  "选校计划字段列应允许收缩，避免三列布局下输入框溢出。"
);
assert.match(
  styles,
  /\.application-plan-row label,\s*\.application-plan-row input,\s*\.application-plan-row select\s*\{[\s\S]*?min-width:\s*0;/,
  "选校计划输入控件应设置 min-width: 0，避免卡片重叠。"
);
assert.match(
  styles,
  /\.application-plan-row\.with-action\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*0\.9fr\)\s*auto;/,
  "可新增轮次应为删除按钮预留操作列。"
);
assert.match(styles, /\.academic-records-layout\s*\{/, "成绩与考试模块应有专用布局样式。");
assert.match(styles, /\.academic-record-row\s*\{/, "GPA/SAT/AP 可增删记录应有稳定行布局。");
assert.match(pageHtml, /id="exportPortfolioSvgButton"[^>]*>导出 SVG/, "我的申请档案应提供 SVG 导出入口。");
assert.match(pageHtml, /id="exportPortfolioWordButton"[^>]*>导出 Word 文档/, "我的申请档案应提供 Word 导出入口。");
assert.match(pageHtml, /id="clearPortfolioButton"[^>]*>清空当前方案/, "我的申请档案应提供清空当前方案入口。");
assert.match(script, /buildSvgDocument/, "我的申请档案应复用 SVG 报告导出。");
assert.match(script, /buildWordDocument/, "我的申请档案应复用 Word 报告导出。");
assert.match(script, /querySelector\("#exportPortfolioSvgButton"\)/, "我的申请档案脚本应绑定 SVG 导出按钮。");
assert.match(script, /querySelector\("#exportPortfolioWordButton"\)/, "我的申请档案脚本应绑定 Word 导出按钮。");
assert.match(script, /querySelector\("#clearPortfolioButton"\)/, "我的申请档案脚本应绑定清空按钮。");
assert.match(script, /application\/msword;charset=utf-8/, "Word 导出应使用 Word 兼容 MIME。");
assert.match(script, /image\/svg\+xml;charset=utf-8/, "SVG 导出应使用 SVG MIME。");
assert.match(script, /export_word/, "我的申请档案 Word 导出应记录 usage event。");
assert.match(script, /export_svg/, "我的申请档案 SVG 导出应记录 usage event。");
assert.match(script, /clear_draft/, "我的申请档案清空当前方案应记录 usage event。");
assert.match(script, /function buildPortfolioExportPayload/, "导出应从当前档案收集报告数据。");
assert.match(script, /function clearCurrentPortfolio/, "清空当前方案应重置当前档案。");
