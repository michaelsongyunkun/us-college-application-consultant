# Extracurricular Planning Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持课外活动规划 Prompt 篇幅、章节和输出格式稳定的前提下，增强真实性、资格可行性、活动递进和差异化约束。

**Architecture:** 仅调整运行时 system prompt，并同步 Prompt 清单哈希和质量元数据版本。现有 DeepSeek 调用参数、输出契约、解析器及前端保持不变；结构与行为边界由 Prompt 完整性测试固定。

**Tech Stack:** Markdown Prompt、Node.js ESM、`node:assert`、JSON manifest、SHA-256

---

### Task 1: 锁定格式与真实性边界

**Files:**
- Modify: `tests/prompt-integrity.test.mjs`

- [ ] **Step 1: 添加会先失败的 Prompt 契约断言**

在现有断言后增加以下检查：

```js
assert.match(prompt, /规划候选/u);
assert.match(prompt, /不得虚构/u);
assert.match(prompt, /资格与可行性核验/u);
assert.match(prompt, /目标成果/u);
assert.match(prompt, /核验方式/u);
assert.ok(prompt.includes("| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |"));
assert.doesNotMatch(prompt, /获省级科创赛二等奖/u);
assert.doesNotMatch(prompt, /准确率达85%/u);
assert.ok(prompt.length >= 2_584 && prompt.length <= 3_160, `Prompt length ${prompt.length} must stay within 90%-110% of 2872 characters.`);
```

- [ ] **Step 2: 运行测试并确认新断言失败**

Run: `node --import tsx tests/prompt-integrity.test.mjs`

Expected: FAIL，原因是旧 Prompt 不含新的真实性与资格约束，且仍包含既成奖项/准确率示例。

### Task 2: 写入方案 B 并同步版本

**Files:**
- Modify: `prompts/us-college-admissions-strategist-agent.md`
- Modify: `prompts/manifest.json`
- Modify: `src/server/ai-quality.mjs`

- [ ] **Step 1: 优化 Prompt 正文**

保持原章节、表格五列、15 项要求和叙事模块，完成以下精确语义调整：

```text
事实边界：所有建议仅为规划候选；用户未提供的信息不得写成既成事实。
执行描述：在原有表格单元格内说明问题、规划动作、目标成果和核验方式。
资格边界：涉及外部机会时执行资格与可行性核验；未知条件明确“待确认”并给出替代路径。
活动组合：前期探索、中期验证、后期沉淀形成依赖和递进，禁止同一项目换名凑数。
创造力边界：不限定题材和行动形式，继续依据兴趣、性格、本地资源和跨学科可能性创造方案。
示例边界：奖项、人数、样本量、准确率均使用“目标/建议区间/待验证”表达。
```

- [ ] **Step 2: 更新 Prompt 版本元数据**

将 `prompts/manifest.json` 中 Prompt `version` 及三个环境的 `active` 更新为 `2026-07-13`，将 `src/server/ai-quality.mjs` 中 `deepseekPlanPrompt` 更新为：

```js
deepseekPlanPrompt: "deepseek-plan-prompt@2026-07-13",
```

- [ ] **Step 3: 运行 Prompt 契约测试**

Run: `node --import tsx tests/prompt-integrity.test.mjs`

Expected: PASS。

### Task 3: 同步哈希并完成回归验证

**Files:**
- Modify: `prompts/manifest.json`
- Test: `tests/deepseek-plan.test.mjs`

- [ ] **Step 1: 计算并写入新 SHA-256**

Run: `node -e "const fs=require('node:fs');const crypto=require('node:crypto');console.log(crypto.createHash('sha256').update(fs.readFileSync('prompts/us-college-admissions-strategist-agent.md')).digest('hex'))"`

Expected: 输出 64 位小写十六进制摘要；将完整输出写入该 Prompt 的 `sha256` 字段。

- [ ] **Step 2: 验证清单与生成链路**

Run: `npm run prompt:check`

Expected: `Verified 1 prompt manifest entry.`

Run: `node --import tsx tests/deepseek-plan.test.mjs`

Expected: PASS，15 项解析、重试和模型参数保持不变。

- [ ] **Step 3: 运行完整项目验证**

Run: `npm run verify`

Expected: syntax、typecheck、OpenAPI、Prompt manifest、contract compatibility、全部测试和 retrieval eval 均通过。若失败来自工作树内既有的无关改动，记录具体命令与错误，不扩大本任务范围。

- [ ] **Step 4: 最终差异复核**

Run: `git diff -- prompts/us-college-admissions-strategist-agent.md prompts/manifest.json src/server/ai-quality.mjs tests/prompt-integrity.test.mjs`

Expected: 仅出现本计划所列 Prompt、版本、哈希和契约断言变更；模型 temperature、max tokens、解析器和输出表格格式均无变化。

本计划不创建 Git 提交：当前工作树包含大量用户未提交改动，且用户未要求提交。
