import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const appJs = await readFile(new URL("../src/client/app.js", import.meta.url), "utf8");

assert.doesNotMatch(
  html,
  /id=["']authShell["'][^>]*class=["'][^"']*\bis-hidden\b[^"']*["']/,
  "Authentication landing view should stay visible if client modules fail to load.",
);
assert.match(
  html,
  /id=["']appShell["'][^>]*class=["'][^"']*\bis-hidden\b[^"']*["']/,
  "Authenticated workspace should stay hidden until the session check resolves.",
);

for (const id of [
  "landingHeader",
  "heroStartButton",
  "authCard",
  "compassPath",
  "compassPathProfile",
  "compassPathEvidence",
  "compassPathDecisions",
  "capabilityHighlights",
  "loggedInPreview",
  "landingProcess",
  "hallucinationRisk",
  "audienceFit",
  "trustCommitment",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing public landing element #${id}`);
}

for (const preservedId of [
  "authForm",
  "authSubmitButton",
  "forgotPasswordButton",
  "authModeButton",
  "appShell",
  "saveButton",
  "exportSvgButton",
  "exportWordButton",
]) {
  assert.match(html, new RegExp(`id=["']${preservedId}["']`), `Existing capability #${preservedId} must remain`);
}

assert.match(
  html,
  /<a id="authModeButton"[^>]*href="\/\?auth=login"[^>]*>已有账号？登录<\/a>/,
  "The login toggle should keep an href fallback so clicking it visibly responds even before client JavaScript runs.",
);
assert.match(
  html,
  /<form id="authForm" class="auth-form" method="post" action="\/api\/auth\/register">/,
  "The auth form should keep a native POST fallback instead of defaulting to an unsafe GET submission.",
);
assert.ok(html.includes("auth-preview-report"), "Public landing should show a product-like report preview in the first viewport.");

for (const id of [
  "workspaceNextAction",
  "workspaceNextActionTitle",
  "workspaceNextActionText",
  "workspacePrimaryActionButton",
  "workspaceProgressProfile",
  "workspaceProgressPlan",
  "workspaceProgressSave",
  "workspaceAskDeepSeekLink",
  "workspacePortfolioLink",
  "workspaceAdvancedActions",
  "workspaceGuide",
  "studentProfileSummary",
  "profileUpdatedAt",
  "planList",
  "newPlanButton",
  "renamePlanButton",
  "deletePlanButton",
  "planningWorkspaceStatus",
  "snapshotNote",
  "createSnapshotButton",
  "snapshotList",
  "activityQualityStatus",
  "activityQualityScore",
  "activityQualitySummary",
  "activityQualityMetrics",
  "activityQualityStrengths",
  "activityQualityIssues",
  "activityQualityActivityNotes",
  "parseDiagnostics",
  "refreshCaseMatchesButton",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing workspace element #${id}`);
}

for (const copy of [
  "AI 美本规划工作台",
  "从散落信息，",
  "到有依据的申请决策",
  "开始整理我的申请",
  "Profile",
  "Evidence",
  "Decisions",
  "院校百科",
  "中国AI升学规划行业TOP级",
  "全站免费使用",
  "资深升学顾问认可",
  "3500+课外活动资源",
  "150+院校详解",
  "全免费开放",
  "领取你的申请行动地图",
  "免费注册并生成规划",
  "可执行、可核验、可复盘",
  "我们如何降低 AI 幻觉风险",
  "登录后能做什么",
  "我的申请档案",
  "GPA / SAT / AP",
  "同步成绩到我的申请",
  "适合谁使用",
  "8-11 年级国际生家庭",
  "不适合谁",
  "保录",
  "代写",
  "人工顾问全案服务",
  "开始申请规划",
  "按当前进度推进。",
  "下一步",
  "先填写学生信息",
  "先填写学生信息。",
  "学生信息",
  "生成规划",
  "保存版本",
  "用申请机器人优化",
  "查看我的申请档案",
  "方案、备份、导出",
  "历史备份",
  "保存备份",
  "保存当前内容",
  "清空当前方案",
  "活动质量检查",
  "数字证据",
  "优先优化",
  "逐项提示",
  "解析诊断",
]) {
  assert.ok(html.includes(copy), `Missing simplified workspace copy: ${copy}`);
}

const dashboardAccountActions = html.match(/<div class="dashboard-account-actions account-actions"[\s\S]*?<\/div>/)?.[0] || "";
const commandNavigation = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const workspaceAdvancedActions = html.match(/<details id="workspaceAdvancedActions"[\s\S]*?<\/details>/)?.[0] || "";
const workspacePriorityActions = html.match(/<div id="workspacePriorityActions"[\s\S]*?<\/div>\s*<\/div>/)?.[0] || "";
const workspacePanelTop = html.match(/<section class="panel workspace-panel"[\s\S]*?<details id="workspaceAdvancedActions"/)?.[0] || "";
const planningActivityTableBody = html.match(/<table id="activityTable"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
const commandSubnav = html.match(/<div class="command-subnav"[\s\S]*?<\/div>/)?.[0] || "";
const dashboardOverview = html.match(/<section id="dashboardOverview"[\s\S]*?<\/section>/)?.[0] || "";

assert.ok(
  html.includes("./styles.css?v=20260806-login-first-screen-v2"),
  "Planning workspace should bust the stylesheet cache for the refreshed login first screen.",
);
assert.ok(dashboardOverview.includes('id="dashboardTaskGrid"'), "Logged-in home should expose a task dashboard grid above the planning form.");
for (const target of ["my-activities.html", "ask-deepseek.html", "school-selection.html", "#profilePanel"]) {
  assert.ok(dashboardOverview.includes(target), `Logged-in dashboard should link users to ${target}.`);
}
for (const selector of [".dashboard-overview", ".dashboard-task-grid", ".dashboard-task-card"]) {
  assert.ok(styles.includes(selector), `Stylesheet should define ${selector}.`);
}
assert.match(
  styles,
  /\.dashboard-task-card:visited\s*\{[\s\S]*?color:\s*#26374f;/,
  "Dashboard task cards should override visited link colors.",
);
assert.match(
  styles,
  /\.dashboard-task-card\s+\*,\s*\.portfolio-completion-card\s+\*\s*\{[\s\S]*?text-decoration:\s*none;/,
  "Action-card descendants should never inherit underlined link styling.",
);
assert.doesNotMatch(html, /brand-page-header/, "Logged-in workspace should not render the removed top brand header.");
assert.ok(dashboardAccountActions.includes('id="logoutButton"'), "Logout should remain in the compact account actions.");
assert.ok(!dashboardAccountActions.includes("primary-nav"), "Compact account actions should not repeat the left-sidebar primary navigation.");
assert.ok(!dashboardAccountActions.includes("utility-nav"), "Compact account actions should not repeat the left-sidebar utility navigation.");
assert.ok(commandNavigation.includes("我的申请档案"), "Left command sidebar should expose the primary navigation group.");
assert.ok(commandNavigation.includes("免责声明"), "Left command sidebar should expose the tools and support entries.");
assert.ok(commandNavigation.includes('class="command-nav-group"'), "Application planning center nav item should support a sub navigation group.");
assert.ok(commandNavigation.includes('aria-label="申请规划中心快捷导航"'), "Application planning center should expose a labeled sub navigation.");
for (const [label, targetId] of [
  ["活动规划表", "planningOutputTable"],
  ["国际竞赛推荐", "competitionRecommendations"],
  ["夏校推荐", "summerSchoolRecommendations"],
  ["推荐信推荐", "recommendationLetterRecommendations"],
  ["相似录取案例参考", "similarAdmissionCases"],
]) {
  assert.ok(commandSubnav.includes(`>${label}</a>`), `Command center sub navigation should include ${label}.`);
  assert.ok(commandSubnav.includes(`href="./index.html#${targetId}"`), `Command center sub navigation should link ${label} to #${targetId}.`);
  assert.match(html, new RegExp(`id=["']${targetId}["']`), `Missing quick-jump target #${targetId}.`);
}
assert.ok(dashboardAccountActions.includes('id="logoutButton"'), "Logout should live in the compact account area.");
assert.ok(!dashboardAccountActions.includes('id="saveButton"'), "Save should not live in the account area.");
assert.ok(!dashboardAccountActions.includes('id="exportButton"'), "JSON export should not live in the account area.");
assert.ok(!dashboardAccountActions.includes('id="exportSvgButton"'), "SVG export should not live in the account area.");
assert.ok(!dashboardAccountActions.includes('id="exportWordButton"'), "Word export should not live in the account area.");
assert.ok(!dashboardAccountActions.includes('id="resetButton"'), "Reset should not live in the account area.");
assert.ok(workspaceAdvancedActions.includes('id="saveButton"'), "Save should live in the advanced workspace actions.");
assert.ok(!workspaceAdvancedActions.includes('id="exportButton"'), "JSON export should be removed from advanced workspace actions.");
assert.ok(!workspaceAdvancedActions.includes('id="exportSvgButton"'), "SVG export should move out of the collapsed advanced workspace actions.");
assert.ok(!workspaceAdvancedActions.includes('id="exportWordButton"'), "Word export should live with the visible export actions.");
assert.ok(!workspaceAdvancedActions.includes('id="resetButton"'), "Reset should move out of the collapsed advanced workspace actions.");
assert.ok(workspacePriorityActions.includes('id="exportSvgButton"'), "SVG export should live in the visible priority action bar.");
assert.ok(workspacePriorityActions.includes('id="exportWordButton"'), "Word export should live in the visible priority action bar.");
assert.ok(workspacePriorityActions.includes('id="resetButton"'), "Reset should live in the visible priority action bar.");
assert.ok(
  workspacePanelTop.indexOf('id="workspaceNextAction"') < workspacePanelTop.indexOf('id="workspacePriorityActions"') &&
    workspacePanelTop.indexOf('id="workspacePriorityActions"') < workspacePanelTop.indexOf('id="workspaceAdvancedActions"'),
  "Priority plan actions should sit visibly between the next-action card and collapsed advanced section.",
);
assert.ok(!/<details id="workspaceAdvancedActions"[^>]*open/.test(html), "Advanced plan, backup, and export actions should be collapsed by default.");
assert.ok(html.includes("15 项活动建议。"), "Planning output table should describe 15 generated activities.");
assert.equal((planningActivityTableBody.match(/<th scope="row">/g) || []).length, 15, "Planning output table should render 15 activity rows.");
assert.ok(planningActivityTableBody.includes('name="type-15"'), "Planning output table should include the 15th activity controls.");
assert.match(html, /id="workspaceGuide" class="workspace-progress-steps" role="list"/, "Progress steps should use an unnumbered list role to avoid raw ordered-list fallback.");
assert.doesNotMatch(html, /<ol id="workspaceGuide"/, "Progress steps should not fall back to browser ordered-list numbering.");
assert.match(html, /class="workspace-progress-step/, "Progress items should have a direct styling class.");
assert.doesNotMatch(html, /三步完成申请规划/, "Workspace should not lead with the old three-step planning copy.");
assert.doesNotMatch(html, /第 1 步：填写学生信息|第 2 步：选择规划方案|第 3 步：保存重要版本/, "Workspace should not show verbose three-step instruction cards.");

assert.doesNotMatch(html, /id="exportButton"/, "Logged-in workspace should not render JSON export.");
assert.doesNotMatch(html, /导出 JSON/, "Logged-in workspace should remove JSON export copy.");
assert.match(html, /id="exportSvgButton"[^>]*class="secondary"/, "SVG export should use a secondary action style.");
assert.match(html, /id="exportWordButton"[^>]*class="secondary"/, "Word export should use a secondary action style.");
assert.match(html, /导出 Word 文档/, "Logged-in workspace should offer Word export.");
assert.match(html, /id="logoutButton"[^>]*class="secondary"/, "Log out should use a secondary action style.");
assert.match(
  html,
  /<form id="logoutForm" action="\/api\/auth\/logout" method="post">[\s\S]*id="logoutButton"/,
  "Logout should keep a native POST fallback when client JavaScript does not run.",
);
assert.match(
  appJs,
  /async function logout\(event\) \{[\s\S]*event\?\.preventDefault\(\);[\s\S]*logoutButton\.disabled = true;[\s\S]*logoutButton\.textContent = "退出中\.\.\.";[\s\S]*window\.location\.assign\("\/"\);[\s\S]*\}/,
  "Logout should immediately show progress and reload to the public home page after clearing the session.",
);
assert.match(
  html,
  /src="\.\/src\/client\/app\.js\?v=20260804-ai-timeout-recovery"/,
  "Main app script should be cache-busted when DeepSeek wait-time copy changes.",
);
assert.match(html, /id="resetButton"[^>]*class="danger"/, "Reset should use a danger action style.");
assert.match(html, /id=["']deepSeekAutoGenerate["']/, "DeepSeek automatic generation panel should be available.");
assert.doesNotMatch(html, /id=["']deepSeekApiKeyInput["']/, "Users should not provide their own DeepSeek API Key.");
assert.doesNotMatch(html, /DeepSeek API Key（仅本次请求使用，不保存）/, "DeepSeek Key input copy should not be shown.");
assert.doesNotMatch(html, /粘贴 DeepSeek API Key/, "DeepSeek Key placeholder should not be shown.");
assert.match(html, /id=["']generateDeepSeekButton["']/, "DeepSeek generation button should be available.");
assert.match(html, /自动生成/, "DeepSeek panel should be labeled clearly.");
assert.match(html, /大约需要 3-4 分钟/, "DeepSeek planning panel should set a realistic wait-time expectation.");
assert.match(html, /id=["']deepSeekWorkingIndicator["']/, "DeepSeek panel should include a visible working indicator.");
assert.match(html, /class=["'][^"']*\bdeepseek-working\b/, "DeepSeek working indicator should have a dedicated style hook.");
assert.match(html, /DeepSeek 正在生成规划/, "DeepSeek working indicator should tell users generation is in progress.");
assert.doesNotMatch(html, /id=["']buildCodexTaskButton["']/, "Task package generation should be removed from the logged-in workspace.");
assert.doesNotMatch(html, /id=["']copyCodexTaskButton["']/, "Task package copying should be removed from the logged-in workspace.");
assert.doesNotMatch(html, /id=["']parseCodexAnswerButton["']/, "Manual AI answer parsing should be removed from the logged-in workspace.");
assert.doesNotMatch(html, /id=["']codexTaskPackage["']/, "Task package textarea should be removed from the logged-in workspace.");
assert.doesNotMatch(html, /id=["']codexAnswerInput["']/, "Manual AI answer paste textarea should be removed from the logged-in workspace.");
assert.doesNotMatch(html, /id=["']generateButton["']/, "Direct OpenAI generation button should be removed.");
assert.doesNotMatch(html, /id=["']apiKeyInput["']/, "OpenAI API Key input should be removed.");
assert.doesNotMatch(html, /OpenAI API Key/, "OpenAI API Key copy should not be shown.");
assert.doesNotMatch(html, /生成并填入表格/, "Direct generation copy should not be shown.");
assert.match(html, /DeepSeek/, "Help text should recommend DeepSeek.");
assert.doesNotMatch(html, /生成任务包|复制任务包|任务包（复制给AI对话）|AI回答粘贴区|ChatGPT/, "Task package and manual external AI copy should be removed.");
assert.doesNotMatch(appJs, /querySelector\("#generateButton"\)/, "Main app should not bind the removed direct generation button.");
assert.doesNotMatch(appJs, /querySelector\("#apiKeyInput"\)/, "Main app should not bind the removed OpenAI API Key input.");
assert.doesNotMatch(appJs, /querySelector\("#exportButton"\)|exportDraft|export_json|application\/json;charset=utf-8/, "Main app should not keep JSON export binding or download code.");
assert.doesNotMatch(appJs, /querySelector\("#deepSeekApiKeyInput"\)/, "Main app should not bind a user DeepSeek Key input.");
assert.doesNotMatch(appJs, /deepSeekApiKey:/, "Main app should not send a user-provided DeepSeek API Key.");
assert.doesNotMatch(appJs, /fetch\("\/api\/plan"/, "Main app should not call the direct OpenAI planning endpoint.");
assert.doesNotMatch(appJs, /buildCodexTask|copyCodexTask|parseCodexAnswer|codexTaskPackage|codexAnswerInput|buildCodexTaskPackage|parseAgentOutput/, "Main app should not keep task package or manual answer parsing code.");
assert.match(appJs, /querySelector\("#exportWordButton"\)/, "Main app should bind Word export.");
assert.match(appJs, /buildWordDocument/, "Main app should build a Word-compatible document.");
assert.match(appJs, /export_word/, "Main app should track Word exports.");
assert.match(appJs, /application\/msword;charset=utf-8/, "Main app should download Word with the correct MIME type.");
assert.match(appJs, /\.doc"/, "Main app should download Word export as a .doc file.");
assert.match(appJs, /querySelector\("#exportSvgButton"\)/, "Main app should bind SVG export.");
assert.match(appJs, /buildSvgDocument/, "Main app should build an SVG export document.");
assert.match(
  appJs,
  /from "\.\.\/domain\/svg-export\.mjs\?v=20260531-svg-wrap"/,
  "SVG export module import should be cache-busted when wrapping behavior changes.",
);
assert.match(appJs, /export_svg/, "Main app should track SVG exports.");
assert.match(appJs, /image\/svg\+xml;charset=utf-8/, "Main app should download SVG with the correct MIME type.");
assert.match(appJs, /querySelector\("#generateDeepSeekButton"\)/, "Main app should bind DeepSeek generation.");
assert.match(appJs, /querySelector\("#deepSeekWorkingIndicator"\)/, "Main app should bind the DeepSeek working indicator.");
assert.match(appJs, /后台生成任务/, "Main app should explain that DeepSeek planning runs as a background job.");
assert.match(appJs, /querySelector\("#workspacePrimaryActionButton"\)/, "Main app should bind the workspace next-action button.");
assert.match(appJs, /function getWorkspaceNextActionState/, "Main app should derive the recommended next action from workspace state.");
assert.match(appJs, /function updateWorkspaceNextAction/, "Main app should render the recommended next action.");
const hasPlanningOutputBody = appJs.match(/function hasPlanningOutput\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.ok(hasPlanningOutputBody.includes("countFilledActivities()"), "Derived recommendations should not make the workspace skip generation.");
assert.ok(!hasPlanningOutputBody.includes("isPlanDraftEmpty"), "Workspace output detection should ignore auto-derived recommendation panels.");
assert.match(appJs, /workspacePrimaryActionButton\?\.addEventListener\("click"/, "Workspace primary action should be clickable.");
assert.match(appJs, /先填写学生信息/, "Workspace next action should guide empty profiles first.");
assert.match(appJs, /生成申请规划/, "Workspace next action should guide generation after profile entry.");
assert.match(appJs, /保存当前规划/, "Workspace next action should guide saving unsaved planning edits.");
assert.match(appJs, /继续优化规划/, "Workspace next action should guide optimization after saving.");
assert.match(appJs, /scrollIntoView\(\{ behavior: "smooth"/, "Workspace next action should scroll users to the right area.");
assert.match(appJs, /window\.location\.href = "\.\/ask-deepseek\.html"/, "Workspace optimization action should route to Ask DeepSeek.");
assert.match(appJs, /setDeepSeekWorking\(true\)/, "Main app should show the DeepSeek working indicator during generation.");
assert.match(appJs, /setDeepSeekWorking\(false\)/, "Main app should hide the DeepSeek working indicator after generation.");
assert.match(appJs, /"\/api\/deepseek-plan-jobs"/, "Main app should create a background DeepSeek planning job.");
assert.match(appJs, /resumePendingDeepSeekPlanJob/, "Main app should resume pending DeepSeek planning jobs.");
assert.match(styles, /\.auth-status:empty\s*\{/, "An empty auth status should be visually hidden.");
assert.doesNotMatch(styles, /\.agent-usage-note|\.codex-mode|\.codex-actions/, "Removed task package UI styles should not remain.");
assert.match(styles, /\.deepseek-working\s*\{/, "DeepSeek working indicator should have panel styling.");
assert.match(styles, /\.workspace-next-action\s*\{/, "Workspace next-action card should have dedicated styling.");
assert.match(styles, /\.workspace-priority-actions\s*\{/, "Visible priority plan actions should have dedicated styling.");
assert.match(styles, /\.workspace-priority-actions\s+button\.danger\s*\{/, "Visible reset action should be styled prominently.");
assert.match(styles, /\.workspace-primary-action\s*\{/, "Workspace primary CTA should have dedicated styling.");
assert.match(styles, /\.workspace-progress-steps\s*\{/, "Workspace progress steps should have dedicated styling.");
assert.match(styles, /\.workspace-progress-step\s*\{/, "Workspace progress items should have dedicated styling.");
assert.match(styles, /\.command-nav-group\s*\{/, "Command center sub navigation group should have dedicated styling.");
assert.match(styles, /\.command-subnav\s*\{/, "Command center sub navigation should have dedicated styling.");
assert.doesNotMatch(styles, /\.workspace-progress-steps li/, "Progress item styles should not depend on ordered-list markup.");
assert.match(styles, /\.workspace-advanced\s*\{/, "Workspace advanced actions should have dedicated styling.");
assert.match(styles, /\.workspace-advanced summary\s*\{/, "Workspace advanced summary should be styled as a quiet disclosure.");
assert.match(styles, /@keyframes deepseek/, "DeepSeek working indicator should include a subtle motion cue.");
assert.match(styles, /\.activity-quality-check\s*\{/, "Activity quality checker should have a distinct style.");
assert.match(styles, /\.parse-diagnostics\s*\{/, "Parse diagnostics should have a distinct style.");
assert.doesNotMatch(styles, /\.markdown-preview/, "Activity descriptions should not render a separate Markdown preview under the table field.");
assert.match(styles, /\/\* Design tokens \*\//, "Stylesheet should expose a design token section.");
assert.match(styles, /\/\* Diagnostics and insight panels \*\//, "Stylesheet should group diagnostic panel styles.");
for (const token of ["--brand-green", "--brand-orange", "--surface-warm", "--radius-card"]) {
  assert.match(styles, new RegExp(token), `Missing trusted-balanced style token ${token}`);
}
for (const selector of [
  ".landing-shell",
  ".landing-header",
  ".landing-hero",
  ".capability-highlights",
  ".logged-in-preview",
  ".preview-feature-grid",
  ".landing-process",
  ".risk-control",
  ".audience-fit",
  ".trust-commitment",
]) {
  assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing style ${selector}`);
}
assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.landing-hero/, "Landing hero should stack on small screens.");
assert.match(styles, /html\s*\{[\s\S]*?overflow-x:\s*visible;/, "Page root should not create an overflow container that breaks sticky sidebars.");
assert.match(styles, /\.auth-preview-report\s*\{/, "Action map preview should include compact report preview styling.");
assert.match(styles, /\.landing-shell-v3\s+\.landing-hero/, "Refreshed first screen should use a scoped hero layout.");
assert.match(
  styles,
  /@media \(max-width: 760px\)[\s\S]*?\.landing-shell-v3\s+\.auth-card/,
  "Refreshed auth card should have an explicit mobile order.",
);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/, "Refreshed first screen should respect reduced motion.");
assert.match(appJs, /const heroStartButton = document\.querySelector\("#heroStartButton"\)/);
assert.match(appJs, /heroStartButton\?\.addEventListener\("click"/);
assert.match(appJs, /initialAuthMode === "login" \|\| getSafeNextPath\(\) \? "login" : "register"/);
assert.match(appJs, /authNameInput\.focus\(\)/);
assert.match(
  appJs,
  /refreshCaseMatchesButton\?\.addEventListener\("click"[\s\S]*renderCaseMatches\(\{ refresh: true \}\)/,
  "Similar case recommendations should expose a next-ranked refresh action.",
);
assert.match(
  appJs,
  /from "\.\.\/domain\/agent-output-parser\.mjs\?v=20260531-deepseek-only"/,
  "Agent output parser import should be cache-busted when parsing behavior changes.",
);
assert.match(
  appJs,
  /from "\.\/planning-form-state\.mjs\?v=20260601-profile-choice-fields"/,
  "Planning form state import should be cache-busted when table fill behavior changes.",
);
assert.match(appJs, /markdownToPlainText/, "Narrative output should share the Markdown-to-readable-text normalizer.");
assert.match(appJs, /narrativeOutput\.value = cleanNarrative/, "Loaded narrative drafts should be normalized before display.");
assert.match(appJs, /narrative: getNarrativeText\(\)/, "Saved narrative output should be normalized before persistence.");
assert.match(
  appJs,
  /from "\.\.\/domain\/admission-case-matcher\.mjs\?v=[a-z0-9-]+"/,
  "The admission case matcher import should be cache-busted when matching behavior changes.",
);
assert.match(appJs, /相似案例第 \$\{selectedIndex \+ 1\}/, "Case refresh should describe the next-ranked match.");
assert.match(
  appJs,
  /async function resetDraft\(\) \{[\s\S]*clearVisibleDraft\(\);[\s\S]*await saveDraft\(\);[\s\S]*\}/,
  "Clearing the current plan should reset visible profile fields and dependent recommendation panels before saving.",
);
assert.match(appJs, /renderActivityQualityPanel/, "Activity quality checker should be wired through a UI module.");
assert.match(appJs, /renderParseDiagnostics/, "Parse diagnostics should be wired into the main app.");
assert.doesNotMatch(appJs, /updateActivityMarkdownPreviews|markdown-preview|renderMarkdown/, "Markdown should be normalized during parsing, not rendered as a separate table preview.");
assert.match(appJs, /collectActivitiesFromTable/, "Planning form state should be collected through a module.");
assert.match(appJs, /data-delete-snapshot-id/, "Snapshot rows should expose a delete action.");
assert.match(appJs, /确认删除这份历史备份吗/, "Snapshot deletion should require confirmation.");
assert.match(appJs, /备份已删除/, "Snapshot deletion should provide completion feedback.");
assert.match(html, /name="schoolContext"/, "Student background should capture school context for eligibility filtering.");
assert.match(html, /非美高（中国大陆高中）/, "Student background should offer a mainland China non-US-high-school option.");
assert.match(html, /name="identityDescription"/, "Student background should capture US identity eligibility conditions.");
assert.doesNotMatch(html, /未来学习方向/, "Future learning direction section should not be shown.");
assert.doesNotMatch(html, /id=["']futureLearningOutput["']/, "Future learning direction textarea should be removed.");
for (const fieldName of ["coreStrengths", "availableResources", "personality"]) {
  assert.match(
    html,
    new RegExp(`data-profile-composite=["']${fieldName}["']`),
    `${fieldName} should be rendered as a choice plus custom profile field.`,
  );
  assert.match(
    html,
    new RegExp(`name=["']${fieldName}Choice["']`),
    `${fieldName} should provide a select control for common options.`,
  );
  assert.match(
    html,
    new RegExp(`name=["']${fieldName}Custom["']`),
    `${fieldName} should provide a freeform custom input.`,
  );
  assert.match(
    html,
    new RegExp(`name=["']${fieldName}["'][^>]*data-profile-composite-output=["']${fieldName}["']`),
    `${fieldName} should keep a canonical hidden field for saving and Agent input.`,
  );
}
assert.match(html, /科研探索 \/ 实验设计/, "Core strength choices should give users concrete examples.");
assert.match(html, /校内实验室 \/ 社团平台/, "Resource choices should give users concrete examples.");
assert.match(html, /内向深度研究型/, "Personality choices should give users concrete examples.");
assert.match(appJs, /syncProfileCompositeFields/, "Main app should keep choice-plus-custom profile fields synchronized.");
assert.match(styles, /\.profile-choice-field\s*\{/, "Choice-plus-custom profile fields should have a dedicated layout style.");
assert.match(
  styles,
  /\.profile-choice-field\s*\{[\s\S]*?border:\s*0;/,
  "Choice-plus-custom profile fields should not draw an outer border around the whole question.",
);
assert.match(
  styles,
  /\.profile-choice-field\s*\{[\s\S]*?min-inline-size:\s*0;/,
  "Choice-plus-custom profile fieldsets should reset browser default fieldset width behavior.",
);
assert.match(
  styles,
  /\.profile-choice-field\s*\{[\s\S]*?background:\s*transparent;/,
  "Choice-plus-custom profile fields should sit directly on the form surface without a boxed wrapper.",
);
for (const fieldName of ["coreStrengths", "availableResources", "personality"]) {
  const fieldHtml = html.match(
    new RegExp(`<fieldset[^>]+data-profile-composite=["']${fieldName}["'][\\s\\S]*?<\\/fieldset>`),
  )?.[0] || "";
  assert.doesNotMatch(fieldHtml, new RegExp(`<select[^>]+name=["']${fieldName}Choice["']`));
  assert.match(
    fieldHtml,
    new RegExp(`type=["']checkbox["'][^>]*name=["']${fieldName}Choice["']`),
    `${fieldName} should use checkbox choices so users can select more than one.`,
  );
  assert.ok(
    (fieldHtml.match(/data-profile-choice-input/g) || []).length >= 24,
    `${fieldName} should provide a richer set of at least 24 choices.`,
  );
}
assert.match(html, /数学建模 \/ 逻辑推理/, "Core strength options should include more academic skill choices.");
assert.match(html, /大学教授 \/ 研究员连接/, "Resource options should include more mentor/research network choices.");
assert.match(html, /好奇心强 \/ 喜欢追问/, "Personality options should include more behavior tendency choices.");
for (const choiceLabel of [
  "论文阅读 / 文献综述",
  "数据可视化 / 信息图表达",
  "产品思维 / 原型设计",
  "实验记录 / 结果复盘",
]) {
  assert.match(html, new RegExp(choiceLabel.replace("/", "\\/")), `Core strength choices should include ${choiceLabel}.`);
}
for (const choiceLabel of [
  "校友网络 / 学长学姐",
  "实验设备 / 创客空间",
  "非营利项目合作方",
  "公开数据库 / 政府数据",
]) {
  assert.match(html, new RegExp(choiceLabel.replace("/", "\\/")), `Resource choices should include ${choiceLabel}.`);
}
for (const choiceLabel of [
  "善于复盘 / 从反馈中迭代",
  "主动建立关系",
  "需要明确截止时间推动",
  "喜欢挑战开放性问题",
]) {
  assert.match(html, new RegExp(choiceLabel.replace("/", "\\/")), `Personality choices should include ${choiceLabel}.`);
}
assert.match(styles, /\.profile-choice-options\s*\{/, "Multi-choice profile fields should have a dropdown menu style.");
assert.match(
  styles,
  /\.profile-choice-options\s*\{[\s\S]*?box-shadow:\s*0 16px 32px/,
  "Expanded multi-choice option lists should float like a select dropdown.",
);
assert.match(styles, /\.profile-choice-option\s*\{/, "Each profile checkbox option should have a stable touch target style.");
for (const fieldName of ["coreStrengths", "availableResources", "personality"]) {
  const fieldHtml = html.match(
    new RegExp(`<fieldset[^>]+data-profile-composite=["']${fieldName}["'][\\s\\S]*?<\\/fieldset>`),
  )?.[0] || "";
  assert.match(fieldHtml, /<details class="profile-multiselect"/, `${fieldName} should collapse choices into a dropdown-like control.`);
  assert.match(fieldHtml, /<summary class="profile-multiselect-summary"/, `${fieldName} should have a compact summary row.`);
  assert.match(fieldHtml, /data-profile-choice-summary/, `${fieldName} should show selected choices in one-line summary text.`);
}
assert.match(styles, /\.profile-multiselect-summary\s*\{[\s\S]*?white-space:\s*nowrap;/, "Dropdown summary should stay on one line.");
assert.match(styles, /\.profile-choice-summary\s*\{[\s\S]*?text-overflow:\s*ellipsis;/, "Selected choices should truncate cleanly in one line.");
assert.match(html, /data-profile-choice-summary>请选择（可多选）<\/span>/, "Dropdown multi-select should look like a select placeholder before choices are picked.");
assert.match(
  styles,
  /\.profile-multiselect-summary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;/,
  "Dropdown multi-select summary should look like a compact select control, not a two-label row.",
);
assert.match(
  styles,
  /\.profile-multiselect-summary\s*\{[\s\S]*?list-style:\s*none;/,
  "Dropdown multi-select summary should suppress the browser default disclosure marker.",
);
assert.match(
  styles,
  /\.profile-multiselect-summary::marker\s*\{[\s\S]*?content:\s*"";/,
  "Dropdown multi-select summary should suppress default markers in browsers that use ::marker.",
);
assert.match(
  styles,
  /\.profile-choice-options\s*\{[\s\S]*?position:\s*absolute;/,
  "Dropdown multi-select options should open as a floating menu instead of pushing the form taller.",
);
assert.match(
  styles,
  /\.profile-choice-options\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  "Dropdown multi-select options should render as select-like list rows, not card grids.",
);
assert.match(
  styles,
  /\.profile-choice-options\s*\{[\s\S]*?max-height:\s*260px;/,
  "Dropdown multi-select menu should be scrollable when options are long.",
);
assert.match(
  styles,
  /\.profile-choice-option\s*\{[\s\S]*?border:\s*0;/,
  "Dropdown multi-select choices should look like option rows instead of bordered cards.",
);
