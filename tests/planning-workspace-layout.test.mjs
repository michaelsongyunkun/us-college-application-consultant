import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const appJs = await readFile(new URL("../app.js", import.meta.url), "utf8");

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
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing workspace element #${id}`);
}

for (const copy of [
  "三步完成申请规划",
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
]) {
  assert.match(html, new RegExp(copy), `Missing simplified workspace copy: ${copy}`);
}

for (const semanticClass of ["primary-links", "utility-links"]) {
  assert.match(html, new RegExp(`class=["'][^"']*${semanticClass}[^"']*["']`), `Missing navigation group .${semanticClass}`);
}

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
for (const token of ["--brand-green", "--brand-orange", "--surface-warm", "--radius-card"]) {
  assert.match(styles, new RegExp(token), `Missing trusted-balanced style token ${token}`);
}
for (const selector of [
  ".landing-shell",
  ".landing-header",
  ".landing-hero",
  ".capability-highlights",
  ".landing-process",
  ".trust-commitment",
]) {
  assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing style ${selector}`);
}
assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.landing-hero/, "Landing hero should stack on small screens.");
assert.match(appJs, /const heroStartButton = document\.querySelector\("#heroStartButton"\)/);
assert.match(appJs, /heroStartButton\?\.addEventListener\("click"/);
assert.match(appJs, /authEmailInput\.focus\(\)/);
assert.match(appJs, /analyzeActivityQuality/, "Activity quality checker should be wired into the main app.");
assert.match(appJs, /data-delete-snapshot-id/, "Snapshot rows should expose a delete action.");
assert.match(appJs, /确认删除这份历史备份吗/, "Snapshot deletion should require confirmation.");
assert.match(appJs, /备份已删除/, "Snapshot deletion should provide completion feedback.");
assert.match(html, /name="schoolContext"/, "Student background should capture school context for eligibility filtering.");
assert.match(html, /非美高（中国大陆高中）/, "Student background should offer a mainland China non-US-high-school option.");
assert.match(html, /name="identityDescription"/, "Student background should capture US identity eligibility conditions.");
assert.doesNotMatch(html, /未来学习方向/, "Future learning direction section should not be shown.");
assert.doesNotMatch(html, /id=["']futureLearningOutput["']/, "Future learning direction textarea should be removed.");
