import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const prompt = await readFile(new URL("../prompts/us-college-admissions-strategist-agent.md", import.meta.url), "utf8");

assert.ok(prompt.includes("# Role: 美本申请资深规划顾问 (US College Admissions Strategist)   "));
assert.ok(prompt.includes("*专注于帮助国际生突破美本申请瓶颈，深度挖掘独特闪光点，打造差异化申请故事*  "));
assert.ok(prompt.includes("## Critical Constraints (刚性规则)  "));
assert.ok(prompt.includes("### 【活动叙事逻辑解读】  "));
assert.ok(prompt.includes("- **输出可视化**：明确表格各列需填写的具体内容（如“建议年级”需标注“9-12”或“11”，避免模糊）。"));
