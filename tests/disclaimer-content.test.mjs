import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageHtml = readFileSync("disclaimer.html", "utf8");

assert.ok(pageHtml.includes("<title>免责声明与数据使用说明</title>"));
assert.ok(pageHtml.includes("<h1>免责声明与数据使用说明</h1>"));
assert.ok(pageHtml.includes("AI 辅助生成与人工核验"));
assert.ok(pageHtml.includes("外部 AI 对话工具"));
assert.ok(pageHtml.includes("DeepSeek API"));
assert.ok(!pageHtml.includes("OpenAI API"));
assert.ok(pageHtml.includes("项目、案例与院校资料"));
assert.ok(pageHtml.includes("账户、安全与使用记录"));
assert.ok(pageHtml.includes("学生档案、规划版本与未成年人信息"));
assert.ok(pageHtml.includes("未满 14 周岁"));
assert.ok(pageHtml.includes("更正或删除"));
