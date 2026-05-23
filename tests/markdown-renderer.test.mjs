import assert from "node:assert/strict";
import { renderMarkdown } from "../markdown-renderer.mjs";

const html = renderMarkdown(`
### 问题
- **问题**：学生缺少清晰议题
- 成果：形成 \`research brief\`
1. 影响：服务校内社群
`);

assert.ok(html.includes("<h5>问题</h5>"));
assert.ok(html.includes("<ul>"));
assert.ok(html.includes("<strong>问题</strong>"));
assert.ok(html.includes("<code>research brief</code>"));
assert.ok(html.includes("<ol>"));
assert.ok(!html.includes("<script>"));

const escaped = renderMarkdown("<script>alert(1)</script>");
assert.ok(escaped.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
