import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const appJs = await readFile(new URL("../src/client/app.js", import.meta.url), "utf8");

assert.match(
  html,
  /id=["']authShell["'][^>]*class=["'][^"']*\bis-hidden\b[^"']*["']/,
  "Authentication landing view should stay hidden until the session check resolves.",
);

for (const id of [
  "landingHeader",
  "heroStartButton",
  "authCard",
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
  "exportButton",
  "exportSvgButton",
]) {
  assert.match(html, new RegExp(`id=["']${preservedId}["']`), `Existing capability #${preservedId} must remain`);
}

for (const id of [
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
  "三步完成申请规划",
  "AI 美本规划工作台",
  "生成规划，",
  "顺手匹配资源",
  "免费生成我的行动地图",
  "课外活动资源库",
  "院校百科",
  "中国AI升学规划行业TOP级",
  "全站免费使用",
  "资深升学顾问认可",
  "650+资源支持",
  "150+院校详解",
  "全免费开放",
  "全免费使用",
  "领取你的申请行动地图",
  "网站核心功能目前全免费",
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
  "第 1 步：填写学生信息",
  "第 2 步：选择规划方案",
  "第 3 步：保存重要版本",
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

const loggedInHeader = html.match(/<header class="topbar brand-page-header logged-in-header"[\s\S]*?<\/header>/)?.[0] || "";
const commandNavigation = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
const workspaceActions = html.match(/<div class="workspace-action-bar"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";

assert.ok(loggedInHeader.includes('class="brand-mark"'), "Logged-in header should use the shared product brand link.");
assert.ok(loggedInHeader.includes("College Compass"), "Logged-in header should use the shared product brand name.");
assert.ok(!loggedInHeader.includes("primary-nav"), "Logged-in header should not repeat the left-sidebar primary navigation.");
assert.ok(!loggedInHeader.includes("utility-nav"), "Logged-in header should not repeat the left-sidebar utility navigation.");
assert.ok(commandNavigation.includes("我的申请档案"), "Left command sidebar should expose the primary navigation group.");
assert.ok(commandNavigation.includes("免责声明"), "Left command sidebar should expose the tools and support entries.");
assert.ok(loggedInHeader.includes('id="logoutButton"'), "Logout should live in the account area.");
assert.ok(!loggedInHeader.includes('id="saveButton"'), "Save should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="exportButton"'), "JSON export should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="exportSvgButton"'), "SVG export should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="resetButton"'), "Reset should not live in the global header.");
assert.ok(workspaceActions.includes('id="saveButton"'), "Save should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="exportButton"'), "JSON export should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="exportSvgButton"'), "SVG export should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="resetButton"'), "Reset should remain available in the workspace action bar.");

assert.match(html, /id="exportButton"[^>]*class="secondary"/, "JSON export should use a secondary action style.");
assert.match(html, /id="exportSvgButton"[^>]*class="secondary"/, "SVG export should use a secondary action style.");
assert.doesNotMatch(html, /导出 Word/, "Logged-in workspace should replace Word export with SVG export.");
assert.match(html, /id="logoutButton"[^>]*class="secondary"/, "Log out should use a secondary action style.");
assert.match(html, /id="resetButton"[^>]*class="danger"/, "Reset should use a danger action style.");
assert.match(html, /id=["']deepSeekAutoGenerate["']/, "DeepSeek automatic generation panel should be available.");
assert.doesNotMatch(html, /id=["']deepSeekApiKeyInput["']/, "Users should not provide their own DeepSeek API Key.");
assert.doesNotMatch(html, /DeepSeek API Key（仅本次请求使用，不保存）/, "DeepSeek Key input copy should not be shown.");
assert.doesNotMatch(html, /粘贴 DeepSeek API Key/, "DeepSeek Key placeholder should not be shown.");
assert.match(html, /id=["']generateDeepSeekButton["']/, "DeepSeek generation button should be available.");
assert.match(html, /DeepSeek 自动生成/, "DeepSeek panel should be labeled clearly.");
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
assert.doesNotMatch(appJs, /querySelector\("#deepSeekApiKeyInput"\)/, "Main app should not bind a user DeepSeek Key input.");
assert.doesNotMatch(appJs, /deepSeekApiKey:/, "Main app should not send a user-provided DeepSeek API Key.");
assert.doesNotMatch(appJs, /fetch\("\/api\/plan"/, "Main app should not call the direct OpenAI planning endpoint.");
assert.doesNotMatch(appJs, /buildCodexTask|copyCodexTask|parseCodexAnswer|codexTaskPackage|codexAnswerInput|buildCodexTaskPackage|parseAgentOutput/, "Main app should not keep task package or manual answer parsing code.");
assert.doesNotMatch(appJs, /exportWordButton|exportWordDocument|buildWordDocument|export_word|application\/msword|\.doc"/, "Main app should replace Word export with SVG export.");
assert.match(appJs, /querySelector\("#exportSvgButton"\)/, "Main app should bind SVG export.");
assert.match(appJs, /buildSvgDocument/, "Main app should build an SVG export document.");
assert.match(appJs, /export_svg/, "Main app should track SVG exports.");
assert.match(appJs, /image\/svg\+xml;charset=utf-8/, "Main app should download SVG with the correct MIME type.");
assert.match(appJs, /querySelector\("#generateDeepSeekButton"\)/, "Main app should bind DeepSeek generation.");
assert.match(appJs, /querySelector\("#deepSeekWorkingIndicator"\)/, "Main app should bind the DeepSeek working indicator.");
assert.match(appJs, /setDeepSeekWorking\(true\)/, "Main app should show the DeepSeek working indicator during generation.");
assert.match(appJs, /setDeepSeekWorking\(false\)/, "Main app should hide the DeepSeek working indicator after generation.");
assert.match(appJs, /"\/api\/deepseek-plan"/, "Main app should call the DeepSeek planning endpoint.");
assert.match(styles, /\.auth-status:empty\s*\{/, "An empty auth status should be visually hidden.");
assert.doesNotMatch(styles, /\.agent-usage-note|\.codex-mode|\.codex-actions/, "Removed task package UI styles should not remain.");
assert.match(styles, /\.deepseek-working\s*\{/, "DeepSeek working indicator should have panel styling.");
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
assert.match(appJs, /const heroStartButton = document\.querySelector\("#heroStartButton"\)/);
assert.match(appJs, /heroStartButton\?\.addEventListener\("click"/);
assert.match(appJs, /setAuthMode\(getSafeNextPath\(\) \? "login" : "register"\)/);
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
  /from "\.\/planning-form-state\.mjs\?v=20260531-narrative-cleanup"/,
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
assert.match(appJs, /匹配度排名第 \$\{selectedIndex \+ 1\}/, "Case refresh should describe the next-ranked match.");
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
