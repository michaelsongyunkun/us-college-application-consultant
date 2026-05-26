import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const pageHtml = readFileSync("contact.html", "utf8");

assert.ok(pageHtml.includes('class="contact-team"'), "Contact page should include the team section.");
assert.ok(pageHtml.includes("我们的团队"), "Contact page should label the team section.");
assert.ok(pageHtml.includes("Yunkun Song"), "Contact page should identify the team member.");
assert.ok(pageHtml.includes("AI 产品经理 / 全栈开发工程师"), "Contact page should state the member role.");
assert.ok(pageHtml.includes("波士顿大学本科生"), "Contact page should state the member academic background.");
assert.ok(pageHtml.includes("热爱 AI 与国际教育行业"), "Contact page should state the member focus.");
assert.match(
  pageHtml,
  /src="\.\/assets\/yunkun-song-avatar\.png"/,
  "Contact page should display the local virtual portrait asset.",
);
assert.ok(existsSync("assets/yunkun-song-avatar.png"), "The virtual portrait asset should exist.");
