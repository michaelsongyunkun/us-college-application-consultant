import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AI_QUALITY_VERSIONS } from "../src/server/ai-quality.mjs";

const prompt = await readFile(new URL("../prompts/us-college-admissions-strategist-agent.md", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../prompts/manifest.json", import.meta.url), "utf8"),
);
assert.ok(prompt.includes("15项活动"));

assert.ok(prompt.includes("# Role: 美本申请资深规划顾问 (US College Admissions Strategist)   "));
assert.ok(prompt.includes("*专注于帮助国际生突破美本申请瓶颈，深度挖掘独特闪光点，打造差异化申请故事*  "));
assert.ok(prompt.includes("## Critical Constraints (刚性规则)  "));
assert.ok(prompt.includes("### 【活动叙事逻辑解读】  "));
assert.ok(prompt.includes("- **输出可视化**：明确表格各列需填写的具体内容（如“建议年级”需标注“9-12”或“11”，避免模糊）。"));

assert.match(prompt, /规划候选/u);
assert.match(prompt, /不得虚构/u);
assert.match(prompt, /资格与可行性核验/u);
assert.match(prompt, /目标成果/u);
assert.match(prompt, /核验方式/u);
assert.match(prompt, /建议年级不得早于用户当前年级/u);
assert.match(prompt, /总分不得改写为单项分/u);
assert.match(prompt, /未提供或未经核验的具体课程、竞赛、组织、期刊或项目名称/u);
assert.match(prompt, /同一项必须逐字标注“待核验：名称、资格、截止日期、成本”/u);
assert.match(prompt, /15项是候选池，不是并行执行清单/u);
assert.match(prompt, /不超过4项/u);
assert.match(prompt, /总周投入不得超过用户时间预算/u);
assert.ok(prompt.includes("| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |"));
assert.doesNotMatch(prompt, /获省级科创赛二等奖/u);
assert.doesNotMatch(prompt, /准确率达85%/u);
assert.ok(
  prompt.length >= 2_584 && prompt.length <= 3_160,
  `Prompt length ${prompt.length} must stay within 90%-110% of 2872 characters.`,
);

const promptEntry = manifest.prompts.find((entry) => entry.id === "us-college-admissions-strategist");
assert.equal(promptEntry?.version, "2026-07-13");
for (const environment of Object.values(manifest.environments)) {
  assert.equal(environment.active, "us-college-admissions-strategist@2026-07-13");
}
assert.equal(AI_QUALITY_VERSIONS.deepseekPlanPrompt, "deepseek-plan-prompt@2026-07-13");
