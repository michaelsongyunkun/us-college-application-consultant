import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const pageHtml = readFileSync("major-encyclopedia.html", "utf8");
const script = readFileSync("src/client/major-encyclopedia.js", "utf8");
const styles = readFileSync("styles.css", "utf8");
const commandNavigation = indexHtml.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.doesNotMatch(pageHtml, /class="[^"]*brand-page-header[^"]*"/, "Major page should not render the removed top brand header.");
assert.ok(pageHtml.includes('href="./index.html"'), "Major page must retain access to the planning workspace.");
assert.ok(pageHtml.includes('aria-current="page">专业百科</a>'), "Major page should mark 专业百科 as active.");
assert.ok(
  commandNavigation.indexOf("resource-library.html") < commandNavigation.indexOf("school-encyclopedia.html")
    && commandNavigation.indexOf("school-encyclopedia.html") < commandNavigation.indexOf("major-encyclopedia.html")
    && commandNavigation.indexOf("major-encyclopedia.html") < commandNavigation.indexOf("course-helper.html"),
  "Expanded command navigation should place 专业百科 after 院校百科 and before academic tools.",
);

for (const expected of [
  "专业百科",
  "DeepSeek 匹配专业",
  "根据我的申请档案自动匹配专业",
  'id="majorList"',
  'id="majorStatus"',
  'id="deepSeekMajorMatchButton"',
]) {
  assert.ok(pageHtml.includes(expected), `Major encyclopedia page should include ${expected}.`);
}

for (const removed of [
  "手动匹配专业",
  "双模式",
  "搜索专业资料",
  "适合检索的英文口径",
  'id="manualMajorMatchForm"',
  'id="manualMajorResults"',
  'id="manualCareerKeywords"',
  'id="manualMajorFitNotes"',
  'id="majorSearch"',
  'details class="major-multiselect"',
  "data-major-choice-summary",
]) {
  assert.ok(!pageHtml.includes(removed), `Major encyclopedia page should remove ${removed}.`);
}

assert.ok(script.includes('fetch("./data/majors.md")'), "Major page should load the local DOCX-derived RAG markdown.");
assert.ok(script.includes('"/api/deepseek-rag-jobs"'), "DeepSeek major matching should create a background RAG job.");
assert.ok(script.includes("resumePendingMajorMatchJob"), "DeepSeek major matching should resume pending jobs after navigation.");
assert.ok(script.includes('assistantProfile: "major-match"'), "DeepSeek major matching should request the dedicated major-match system prompt.");
assert.ok(script.includes("专业百科 RAG"), "DeepSeek prompt should explicitly ask for 专业百科 RAG.");
assert.ok(script.includes("sanitizeDeepSeekMajorAnswer"), "DeepSeek major matching should sanitize hidden columns from model output.");
assert.ok(script.includes("trackMajorUsageEvent"), "专业百科应记录关键使用行为。");
assert.ok(script.includes("major_match_success"), "专业百科应记录 DeepSeek 专业匹配成功。");
assert.ok(script.includes("major_match_failure"), "专业百科应记录 DeepSeek 专业匹配失败。");
assert.ok(!script.includes('document.querySelector("#majorSearch")'), "Major page script should not bind the removed search input.");
assert.ok(!script.includes("适合检索的英文口径"), "DeepSeek major matching should not ask for English search wording.");
assert.ok(!script.includes("参考资料"), "DeepSeek major matching should not render a visible references block.");
assert.ok(script.includes('document.querySelector("#deepSeekMajorMatchButton")'));
assert.ok(!script.includes('document.querySelector("#manualMajorMatchForm")'), "Major page script should not bind the removed manual form.");
assert.ok(!script.includes("matchMajorsFromQuestionnaire"), "Major page script should not import the removed manual scorer.");
assert.match(
  styles,
  /\.major-action-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  "Major matching panels should stack as full-width work surfaces.",
);
assert.match(
  styles,
  /\.major-match-panel\s*\{[\s\S]*?--major-match-body-inset:\s*20px;/,
  "DeepSeek match panel should keep generated match content aligned with the panel body.",
);
assert.match(
  styles,
  /\.major-match-panel > button\s*\{[\s\S]*?margin-left:\s*var\(--major-match-body-inset\);/,
  "DeepSeek match button should align with the inset body content.",
);
assert.match(
  styles,
  /\.major-match-panel > \.status\s*\{[\s\S]*?margin:\s*0 var\(--major-match-body-inset\);[\s\S]*?padding:\s*9px 20px;/,
  "DeepSeek status strip should keep text away from the left edge.",
);
assert.match(
  styles,
  /\.major-ai-result\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?padding:\s*0 var\(--major-match-body-inset\) 24px;/,
  "DeepSeek result area should align with the panel content.",
);
assert.match(
  styles,
  /\.major-ai-answer\s*\{[\s\S]*?box-sizing:\s*border-box;[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow-x:\s*auto;/,
  "DeepSeek answer card should shrink inside the panel instead of overflowing past the right corner.",
);
assert.match(
  styles,
  /\.major-ai-answer :is\(ol,\s*ul\)\s*\{[\s\S]*?padding-left:\s*24px;/,
  "DeepSeek answer lists should use a compact inset rather than the browser default.",
);
assert.match(
  styles,
  /\.major-ai-result \.resource-empty\s*\{[\s\S]*?padding:\s*18px 24px;/,
  "DeepSeek result placeholder should keep text away from the left edge.",
);

for (const selector of [
  ".major-action-grid",
  ".major-match-panel",
  ".major-ai-result",
  ".major-ai-answer",
]) {
  assert.ok(styles.includes(selector), `Stylesheet should define ${selector}.`);
}

for (const removedSelector of [
  ".major-multiselect",
  ".major-choice-options",
  ".major-question-form",
  ".major-result-list",
]) {
  assert.ok(!styles.includes(removedSelector), `Stylesheet should remove ${removedSelector}.`);
}

assert.match(
  pageHtml,
  /src="\.\/src\/client\/major-encyclopedia\.js\?v=[a-z0-9-]+"/,
  "Major encyclopedia script should use a cache-busted URL.",
);
assert.match(
  script,
  /from "\.\.\/domain\/major-encyclopedia\.mjs\?v=[a-z0-9-]+"/,
  "Major encyclopedia parser import should use a cache-busted URL.",
);
