import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import {
  buildFeedbackRecord,
  FEEDBACK_SUCCESS_MESSAGE,
} from "../src/client/feedback.js";

const indexHtml = await readFile("index.html", "utf8");

assert.match(
  indexHtml,
  /<a class="button-link quiet-link title-link" href="\.\/feedback\.html" data-safe-nav>建议反馈<\/a>/,
  "Logged-in utility navigation should link to the feedback page.",
);
assert.match(
  indexHtml,
  /<a href="\.\/feedback\.html">建议反馈<\/a>/,
  "Public login area should expose feedback for users who cannot enter the app.",
);

const feedbackHtml = await readFile("feedback.html", "utf8");

assert.ok(feedbackHtml.includes("<title>建议反馈</title>"));
assert.ok(feedbackHtml.includes('id="feedbackForm"'), "Feedback page should include a form.");
assert.ok(feedbackHtml.includes('name="issueType"'), "Feedback form should capture the issue type.");
assert.ok(feedbackHtml.includes('name="pageName"'), "Feedback form should capture the page or feature.");
assert.ok(feedbackHtml.includes('name="description"'), "Feedback form should capture the problem description.");
assert.ok(feedbackHtml.includes('name="steps"'), "Feedback form should capture reproduction steps.");
assert.ok(feedbackHtml.includes('name="contact"'), "Feedback form should allow optional contact details.");
assert.ok(feedbackHtml.includes("本地试行"), "Feedback page should clearly label the local trial behavior.");
assert.ok(feedbackHtml.includes('id="feedbackStatus"'), "Feedback page should show submit status.");
assert.ok(!feedbackHtml.includes("本地记录"), "Feedback page should not show a local history section.");
assert.ok(!feedbackHtml.includes('id="feedbackLatest"'), "Feedback page should not include local feedback history.");
assert.match(
  feedbackHtml,
  /src="\.\/src\/client\/feedback\.js\?v=[a-z0-9-]+"/u,
  "Feedback page should load its client module with a cache-busting version.",
);
assert.equal(FEEDBACK_SUCCESS_MESSAGE, "建议提交成功");

const feedbackScript = await readFile("src/client/feedback.js", "utf8");
assert.ok(feedbackScript.includes('fetch("/api/feedback"'), "Feedback form should submit to the feedback API.");
assert.ok(!feedbackScript.includes("localStorage"), "Feedback form should not keep local feedback history.");

const record = buildFeedbackRecord(
  {
    issueType: "功能异常",
    pageName: "规划 Agent",
    description: "点击生成规划后一直显示加载中，没有返回结果。",
    steps: "填写背景后点击生成规划。",
    contact: "student@example.com",
  },
  new Date("2026-05-29T04:00:00.000Z"),
);
assert.equal(record.issueType, "功能异常");
assert.equal(record.pageName, "规划 Agent");
assert.equal(record.description, "点击生成规划后一直显示加载中，没有返回结果。");
assert.equal(record.steps, "填写背景后点击生成规划。");
assert.equal(record.contact, "student@example.com");
assert.equal(record.createdAt, "2026-05-29T04:00:00.000Z");
assert.match(record.id, /^feedback-2026-05-29T04-00-00-000Z-/);

assert.throws(
  () =>
    buildFeedbackRecord({
      issueType: "功能异常",
      pageName: "规划 Agent",
      description: "太短",
    }),
  /请至少用 10 个字描述问题/,
);

const tempDir = await mkdtemp(join(tmpdir(), "consultant-feedback-page-"));
const server = createAppServer({ databasePath: join(tempDir, "auth.sqlite") });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/feedback.html`);
  assert.equal(response.status, 200, "Feedback page should be available before login.");
  assert.match(await response.text(), /建议反馈/);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
