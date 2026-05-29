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
  "generateButton",
  "saveButton",
  "exportButton",
  "exportWordButton",
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
  "可执行、可核验、可复盘",
  "我们如何降低 AI 幻觉风险",
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
  assert.match(html, new RegExp(copy), `Missing simplified workspace copy: ${copy}`);
}

for (const semanticClass of ["primary-nav", "utility-nav"]) {
  assert.match(html, new RegExp(`class=["'][^"']*${semanticClass}[^"']*["']`), `Missing navigation group .${semanticClass}`);
}

const loggedInHeader = html.match(/<header class="topbar brand-page-header logged-in-header"[\s\S]*?<\/header>/)?.[0] || "";
const workspaceActions = html.match(/<div class="workspace-action-bar"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || "";

assert.ok(loggedInHeader.includes('class="brand-mark"'), "Logged-in header should use the shared product brand link.");
assert.ok(loggedInHeader.includes("College Compass"), "Logged-in header should use the shared product brand name.");
assert.ok(loggedInHeader.includes('aria-label="主导航"'), "Logged-in header should expose a primary navigation group.");
assert.ok(loggedInHeader.includes('aria-label="工具与支持"'), "Logged-in header should expose a compact tools/support group.");
assert.ok(loggedInHeader.includes('id="logoutButton"'), "Logout should live in the account area.");
assert.ok(!loggedInHeader.includes('id="saveButton"'), "Save should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="exportButton"'), "JSON export should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="exportWordButton"'), "Word export should not live in the global header.");
assert.ok(!loggedInHeader.includes('id="resetButton"'), "Reset should not live in the global header.");
assert.ok(workspaceActions.includes('id="saveButton"'), "Save should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="exportButton"'), "JSON export should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="exportWordButton"'), "Word export should live in the workspace action bar.");
assert.ok(workspaceActions.includes('id="resetButton"'), "Reset should remain available in the workspace action bar.");

assert.match(html, /id="exportButton"[^>]*class="secondary"/, "JSON export should use a secondary action style.");
assert.match(html, /id="exportWordButton"[^>]*class="secondary"/, "Word export should use a secondary action style.");
assert.match(html, /id="logoutButton"[^>]*class="secondary"/, "Log out should use a secondary action style.");
assert.match(html, /id="resetButton"[^>]*class="danger"/, "Reset should use a danger action style.");
assert.match(html, /id=["']codexTaskPackage["']/, "The AI task package field should remain available.");
assert.match(html, /id=["']codexAnswerInput["']/, "The AI answer paste field should remain available.");
assert.match(html, /使用方式①/, "OpenAI API Key help text should explain direct generation.");
assert.match(html, /生成任务包/, "Task package button copy should be generic.");
assert.match(html, /解析回答进表格/, "Parse answer button copy should be generic.");
assert.match(html, /任务包（复制给AI对话）/, "Task package label should mention generic AI chats.");
assert.match(html, /AI回答粘贴区/, "Answer paste label should mention AI instead of Codex.");
assert.match(html, /DeepSeek/, "Help text should recommend DeepSeek.");
assert.match(html, /ChatGPT/, "Help text should recommend ChatGPT.");
assert.match(styles, /\.auth-status:empty\s*\{/, "An empty auth status should be visually hidden.");
assert.match(styles, /\.agent-usage-note\s*\{/, "Agent usage instructions should have a distinct style.");
assert.match(styles, /\.activity-quality-check\s*\{/, "Activity quality checker should have a distinct style.");
assert.match(styles, /\.parse-diagnostics\s*\{/, "Parse diagnostics should have a distinct style.");
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
assert.match(appJs, /authEmailInput\.focus\(\)/);
assert.match(
  appJs,
  /refreshCaseMatchesButton\?\.addEventListener\("click"[\s\S]*renderCaseMatches\(\{ refresh: true \}\)/,
  "Similar case recommendations should expose a next-ranked refresh action.",
);
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
assert.match(appJs, /collectActivitiesFromTable/, "Planning form state should be collected through a module.");
assert.match(appJs, /data-delete-snapshot-id/, "Snapshot rows should expose a delete action.");
assert.match(appJs, /确认删除这份历史备份吗/, "Snapshot deletion should require confirmation.");
assert.match(appJs, /备份已删除/, "Snapshot deletion should provide completion feedback.");
assert.match(html, /name="schoolContext"/, "Student background should capture school context for eligibility filtering.");
assert.match(html, /非美高（中国大陆高中）/, "Student background should offer a mainland China non-US-high-school option.");
assert.match(html, /name="identityDescription"/, "Student background should capture US identity eligibility conditions.");
assert.doesNotMatch(html, /未来学习方向/, "Future learning direction section should not be shown.");
assert.doesNotMatch(html, /id=["']futureLearningOutput["']/, "Future learning direction textarea should be removed.");
