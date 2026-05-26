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
assert.match(styles, /\.auth-status:empty\s*\{/, "An empty auth status should be visually hidden.");
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
assert.match(appJs, /data-delete-snapshot-id/, "Snapshot rows should expose a delete action.");
assert.match(appJs, /确认删除这份历史备份吗/, "Snapshot deletion should require confirmation.");
assert.match(appJs, /备份已删除/, "Snapshot deletion should provide completion feedback.");
assert.match(html, /name="schoolContext"/, "Student background should capture school context for eligibility filtering.");
assert.match(html, /非美高（中国大陆高中）/, "Student background should offer a mainland China non-US-high-school option.");
assert.match(html, /name="identityDescription"/, "Student background should capture US identity eligibility conditions.");
