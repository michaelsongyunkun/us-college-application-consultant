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
  'id="deepSeekWorkflows"',
  "./assets/logo-mark.svg",
  "./assets/deepseek-avatar.svg",
]) {
  assert.ok(pageHtml.includes(expected), `Ask DeepSeek page should include ${expected}.`);
}

for (const workflow of [
  ["profile-audit", "申请档案体检"],
  ["school-strategy", "选校策略分析"],
  ["activity-boost", "活动补强方案"],
  ["recommendation-strategy", "推荐信策略"],
  ["resource-match", "项目/竞赛/夏校匹配"],
  ["school-gap", "院校匹配与差距分析"],
  ["academic-plan", "成绩与课程规划诊断"],
  ["material-checklist", "申请材料清单生成"],
]) {
  assert.ok(
    pageHtml.includes(`data-deepseek-workflow="${workflow[0]}"`),
    `Ask DeepSeek page should include the ${workflow[1]} workflow button.`,
  );
  assert.ok(pageHtml.includes(workflow[1]), `Ask DeepSeek page should show ${workflow[1]}.`);
}

assert.ok(
  !pageHtml.includes("把学生备份、资料库和院校百科一起问"),
  "Ask DeepSeek page should not show the removed RAG summary heading.",
);
assert.ok(
  pageHtml.includes("我是你的申请规划智能体"),
  "Ask DeepSeek page should open with the new agent greeting.",
);
assert.ok(
  script.includes("我是你的申请规划智能体"),
  "Ask DeepSeek reset state should reuse the new agent greeting.",
);
assert.ok(
  pageHtml.includes("选校策略、活动补强、推荐信、成绩档案或项目取舍"),
  "Ask DeepSeek greeting should tell users what they can ask.",
);
assert.ok(
  !pageHtml.includes("我会先检索学生备份、资源库和院校百科"),
  "Ask DeepSeek page should not show the old data-source-first greeting.",
);
assert.ok(
  !script.includes("我会先检索学生备份、资源库和院校百科"),
  "Ask DeepSeek reset state should not show the old data-source-first greeting.",
);
assert.ok(script.includes("WORKFLOW_PROMPTS"), "Ask DeepSeek should keep workflow prompt templates.");
assert.ok(script.includes("deepSeekWorkflows"), "Ask DeepSeek should bind the workflow launcher region.");
assert.ok(script.includes("data-deepseek-workflow"), "Ask DeepSeek should handle workflow button clicks.");
assert.ok(script.includes("请进行一次申请档案体检"), "Ask DeepSeek should prompt the profile audit workflow.");
assert.ok(script.includes("请分析我的选校策略"), "Ask DeepSeek should prompt the school strategy workflow.");
assert.ok(script.includes("请给出活动补强方案"), "Ask DeepSeek should prompt the activity boost workflow.");
assert.ok(script.includes("请制定推荐信策略"), "Ask DeepSeek should prompt the recommendation strategy workflow.");
assert.ok(script.includes("请匹配适合我的项目、竞赛和夏校"), "Ask DeepSeek should prompt the resource match workflow.");
assert.ok(script.includes("请做院校匹配与差距分析"), "Ask DeepSeek should prompt the school gap workflow.");
assert.ok(script.includes("请进行成绩与课程规划诊断"), "Ask DeepSeek should prompt the academic plan workflow.");
assert.ok(script.includes("请生成申请材料清单"), "Ask DeepSeek should prompt the material checklist workflow.");

assert.ok(script.includes('"/api/deepseek-rag"'), "Ask DeepSeek should call the RAG API.");
assert.ok(
  script.includes("renderMarkdown"),
  "Ask DeepSeek should render DeepSeek markdown as visual HTML before showing answers.",
);
assert.doesNotMatch(
  script,
  /renderTextBlocks/,
  "Ask DeepSeek should not expose markdown syntax through plain text block rendering.",
);
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
assert.match(styles, /\.deepseek-workflow-grid\s*\{/, "Ask DeepSeek should style workflow quick actions.");
assert.match(styles, /\.workflow-button\s*\{/, "Ask DeepSeek should style workflow buttons.");
