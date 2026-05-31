import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appPages = [
  "index.html",
  "my-activities.html",
  "ask-deepseek.html",
  "resource-library.html",
  "school-encyclopedia.html",
  "course-helper.html",
  "gpa-calculator.html",
  "disclaimer.html",
  "feedback.html",
  "contact.html",
];

for (const page of appPages) {
  const html = readFileSync(page, "utf8");
  const navigation = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(
    navigation.includes('href="./ask-deepseek.html"'),
    `${page} sidebar should include the Ask DeepSeek entry.`,
  );
  assert.ok(
    navigation.indexOf("my-activities.html") < navigation.indexOf("ask-deepseek.html")
      && navigation.indexOf("ask-deepseek.html") < navigation.indexOf("resource-library.html"),
    `${page} sidebar should place Ask DeepSeek between portfolio and resource library.`,
  );
}

const pageHtml = readFileSync("ask-deepseek.html", "utf8");
const script = readFileSync("src/client/ask-deepseek.js", "utf8");

for (const expected of [
  "问DeepSeek",
  "学生备份",
  "资源库",
  "院校百科",
  'id="deepSeekQuestionForm"',
  'id="deepSeekQuestion"',
  'id="deepSeekAnswer"',
  'id="deepSeekSources"',
  'id="deepSeekAskStatus"',
]) {
  assert.ok(pageHtml.includes(expected), `Ask DeepSeek page should include ${expected}.`);
}

assert.ok(script.includes('"/api/deepseek-rag"'), "Ask DeepSeek should call the RAG API.");
assert.ok(script.includes("renderSources"), "Ask DeepSeek should show retrieved source cards.");
assert.ok(script.includes("question.length"), "Ask DeepSeek should validate empty questions before sending.");
assert.match(
  pageHtml,
  /src="\.\/src\/client\/ask-deepseek\.js\?v=[a-z0-9-]+"/,
  "Ask DeepSeek script should be cache-busted.",
);
