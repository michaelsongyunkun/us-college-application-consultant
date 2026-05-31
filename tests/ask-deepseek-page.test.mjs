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
const styles = readFileSync("styles.css", "utf8");

for (const expected of [
  "问DeepSeek",
  "学生备份",
  "资源库",
  "院校百科",
  'id="deepSeekChatLog"',
  'id="deepSeekQuestionForm"',
  'id="deepSeekQuestion"',
  'id="deepSeekAskStatus"',
  "./assets/logo-mark.svg",
  "./assets/deepseek-avatar.svg",
]) {
  assert.ok(pageHtml.includes(expected), `Ask DeepSeek page should include ${expected}.`);
}

assert.ok(script.includes('"/api/deepseek-rag"'), "Ask DeepSeek should call the RAG API.");
assert.ok(script.includes("renderThinkingMessage"), "Ask DeepSeek should render a thinking message.");
assert.ok(script.includes("......"), "DeepSeek thinking state should show six dots.");
assert.ok(script.includes("renderSourceCards"), "Ask DeepSeek should show retrieved source cards inside the answer.");
assert.ok(script.includes("参考资料"), "Ask DeepSeek answers should include a reference section.");
assert.ok(script.includes("question.length"), "Ask DeepSeek should validate empty questions before sending.");
assert.match(
  pageHtml,
  /src="\.\/src\/client\/ask-deepseek\.js\?v=[a-z0-9-]+"/,
  "Ask DeepSeek script should be cache-busted.",
);
assert.match(styles, /\.deepseek-chat-log\s*\{/, "Ask DeepSeek should style the chat log.");
assert.match(styles, /\.chat-message\.user\s*\{/, "Ask DeepSeek should have right-side user messages.");
assert.match(styles, /\.chat-message\.assistant\s*\{/, "Ask DeepSeek should have left-side assistant messages.");
assert.match(styles, /\.thinking-dots\s*\{/, "Ask DeepSeek should style the thinking dots.");
