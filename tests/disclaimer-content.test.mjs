import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageHtml = readFileSync("disclaimer.html", "utf8");

assert.ok(pageHtml.includes("<title>免责声明与数据使用说明</title>"));
assert.ok(pageHtml.includes("<h1>免责声明与数据使用说明</h1>"));
assert.ok(pageHtml.includes("AI 功能、DeepSeek 处理与人工核验"));
assert.ok(pageHtml.includes("外部 AI 对话工具"));
assert.ok(pageHtml.includes("DeepSeek API"));
assert.ok(!pageHtml.includes("OpenAI API"));
assert.ok(pageHtml.includes("服务范围与辅助性质"));
assert.ok(pageHtml.includes("选校、专业匹配与档案能力评估"));
assert.ok(pageHtml.includes("自定义大学排名"));
assert.ok(pageHtml.includes("账户、学生工作区与使用记录"));
assert.ok(pageHtml.includes("浏览器存储、异步任务与文件导出"));
assert.ok(pageHtml.includes("数据导出、账户删除与第三方服务"));
assert.ok(pageHtml.includes("未满 14 周岁"));
assert.ok(pageHtml.includes("更正或删除"));
