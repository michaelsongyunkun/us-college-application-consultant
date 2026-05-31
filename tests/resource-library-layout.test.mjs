import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("resource-library.html", "utf8");
const script = readFileSync("src/client/resource-library.js", "utf8");
const filterForm = html.match(/<form id="resourceEligibilityForm"[\s\S]*?<\/form>/)?.[0] || "";
const toolbar = html.match(/<div class="resource-toolbar">[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";

assert.match(html, /class="[^"]*brand-page-header[^"]*"/, "Resource page should use the shared brand header.");
assert.ok(html.includes('href="./index.html"'), "Resource page must retain access to the planning workspace.");
assert.ok(filterForm.includes('id="resourceSearch"'), "搜索输入框应位于我的可参与条件区域中。");
assert.ok(filterForm.includes('id="resourceSchoolContext"'), "可参与条件应允许选择当前就读体系。");
assert.ok(filterForm.includes("中国大陆高中在读"), "就读体系应明确覆盖中国大陆高中学生。");
assert.ok(filterForm.includes('id="resourceEligibilityFields"'), "项目资源应保留国籍、身份、就读体系和参与方式筛选区。");
assert.ok(filterForm.includes('id="activityFilterFields"'), "课外活动库应提供独立筛选区。");
assert.ok(filterForm.includes('id="activityCommonAppType"'), "课外活动库筛选应包含 Common App 类型下拉。");
assert.ok(filterForm.includes('id="activityMajorDirection"'), "课外活动库筛选应包含专业方向输入。");
assert.ok(!toolbar.includes('id="resourceSearch"'), "搜索输入框不应继续位于独立资源工具栏中。");
assert.ok(html.includes('id="researchProjectTab"'), "应提供实习/科研库标签。");
assert.ok(html.includes('id="researchProjectLibrary"'), "应提供实习/科研库内容面板。");
assert.ok(html.includes("实习/科研库"), "标签应使用用户指定的名称。");
assert.ok(html.includes('id="extracurricularActivityTab"'), "应提供课外活动库标签。");
assert.ok(html.includes('id="extracurricularActivityLibrary"'), "应提供课外活动库内容面板。");
assert.ok(html.includes("课外活动库"), "资源库应新增课外活动库入口。");
assert.ok(html.includes('id="loadMoreResources"'), "资源库应提供加载更多按钮。");
assert.ok(script.includes('fetch("./data/extracurricular-activities.md")'), "前端脚本应加载由 docx 转出的课外活动库 RAG 数据。");
assert.ok(script.includes("parseExtracurricularActivitiesMarkdown"), "前端脚本应使用课外活动库解析器。");
assert.ok(script.includes("updateFilterMode"), "切换到课外活动库时应切换筛选方式。");
assert.ok(script.includes("populateActivityFilterOptions"), "课外活动库应从 RAG 数据生成 Common App 类型和专业方向筛选项。");
assert.ok(script.includes("activityFilters"), "课外活动库应使用独立于资格条件的活动筛选状态。");
assert.ok(script.includes("相关申请 / 报名要求"), "已排除项目应展示触发筛选的申请或报名要求。");
assert.ok(script.includes("<dt>简介</dt>"), "竞赛卡片应展示导入文档提供的项目简介。");
assert.ok(script.includes("<dt>报名 / 比赛时间</dt>"), "竞赛卡片应展示导入文档提供的时间字段。");
assert.ok(script.includes("<dt>活动亮点</dt>"), "课外活动卡片应展示活动亮点字段。");
assert.ok(!script.includes("参与方式待核实"), "卡片不应显示参与方式待核实标签。");
assert.ok(!script.includes("资格待核实"), "卡片不应显示资格待核实标签。");
assert.match(
  html,
  /id="clearResourceEligibility"[^>]*class="secondary"/,
  "清除筛选是普通辅助操作，不应采用危险按钮样式。",
);
