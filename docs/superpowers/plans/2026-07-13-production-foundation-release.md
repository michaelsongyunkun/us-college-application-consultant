# Production Foundation Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复课外活动规划 Prompt 与长输出超时问题，审计当前生产基础设施大改动，通过全部本地和 CI 门禁后以一次提交部署到 Render。

**Architecture:** 保留现有 native Node 主服务和 SQLite/内存/本地文件回退；Fastify、PostgreSQL、Redis/BullMQ、对象存储和 Worker 作为可切换生产能力进入代码，但本次 Render 不进行数据后端切换。规划 Agent 继续使用相同模型、temperature、6500 token 和15项输出 Schema，只增加输入忠实度、现实约束及规划调用专属超时。

**Tech Stack:** Node.js 20+ ESM、TypeScript/tsx、Fastify、Zod/OpenAPI、SQLite/PostgreSQL/Drizzle、Redis/BullMQ、MinIO/S3、LangChain/DeepSeek、Docker/Compose、GitHub Actions、Render

---

### Task 1: 固定提交边界与发布基线

**Files:**
- Review: all tracked and untracked files reported by `git status --short`
- Preserve remotely: existing deleted files under `docs/superpowers/plans/` and `docs/superpowers/specs/`
- Exclude: `.env*` except `.env.example`, `data/*.sqlite*`, `work/`, `outputs/`, logs, backups, exports

- [ ] **Step 1: Capture the authoritative change inventory**

Run:

```powershell
git status --short
git diff --name-status
git ls-files --others --exclude-standard
git diff --stat
```

Expected: every intended runtime/config/test/document file is categorized; 18 historical documentation deletions remain unstaged.

- [ ] **Step 2: Check sensitive and generated paths before editing**

Run:

```powershell
git status --short -- .env data work outputs backups storage
git check-ignore -v .env data/auth.sqlite
```

Expected: `.env` and local SQLite are ignored; no secret or local database is selected for release.

### Task 2: Add failing Prompt regressions

**Files:**
- Modify: `tests/prompt-integrity.test.mjs`
- Modify: `prompts/us-college-admissions-strategist-agent.md`
- Modify: `prompts/manifest.json`
- Modify: `src/server/ai-quality.mjs`

- [ ] **Step 1: Add Prompt contract assertions**

Append assertions equivalent to:

```js
assert.match(prompt, /建议年级不得早于用户当前年级/u);
assert.match(prompt, /总分不得改写为单项分/u);
assert.match(prompt, /未提供或未经核验的具体课程、竞赛、组织、期刊或项目名称/u);
assert.match(prompt, /15项是候选池，不是并行执行清单/u);
assert.match(prompt, /不超过4项/u);
assert.match(prompt, /总周投入不得超过用户时间预算/u);
assert.ok(prompt.includes("| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |"));
assert.ok(prompt.length >= 2_584 && prompt.length <= 3_160);
```

- [ ] **Step 2: Verify RED**

Run: `node --import tsx tests/prompt-integrity.test.mjs`

Expected: FAIL because the current Prompt does not contain all six new constraints.

- [ ] **Step 3: Rewrite existing Prompt clauses without changing output shape**

Implement these exact semantics inside existing sections rather than adding output columns:

```text
建议年级不得早于用户当前年级；过去年级只可引用用户明确提供的既有经历。
保持输入指标语义：总分不得改写为单项分，“正在学习”不得改写为已考试或已获分。
未提供或未经核验的具体课程、竞赛、组织、期刊或项目名称不得写成确定选项；使用通用类别并标注名称、资格和截止日期待核验。
15项是候选池，不是并行执行清单；前10项按匹配度排序为核心候选，后5项为补强备选。
叙事解读给出不超过4项的起步组合，总周投入不得超过用户时间预算。
```

Keep all existing headings, 15 items, table columns and narrative section. Keep character length within 90%-110% of 2872.

- [ ] **Step 4: Update Prompt metadata**

Set:

```js
AI_QUALITY_VERSIONS.deepseekPlanPrompt = "deepseek-plan-prompt@2026-07-13";
```

Update `prompts/manifest.json` version/active references to `2026-07-13` and replace `sha256` with the new file digest.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node --import tsx tests/prompt-integrity.test.mjs
npm run prompt:check
```

Expected: both commands exit 0; Prompt stays within the length gate and manifest hash matches.

### Task 3: Add a planning-specific AI timeout

**Files:**
- Modify: `src/server/ai-call-policy.ts`
- Modify: `src/server/langchain-llm-client.mjs`
- Modify: `src/server/deepseek-plan-service.mjs`
- Modify: `.env.example`
- Modify: `tests/ai-call-policy.test.mjs`
- Modify: `tests/langchain-llm-client.test.mjs`
- Modify: `tests/deepseek-plan.test.mjs`

- [ ] **Step 1: Add failing policy override test**

Add:

```js
const overrideTimeoutPolicy = createAiCallPolicy({ timeoutMs: 5, maxAttempts: 1 });
assert.equal(
  await overrideTimeoutPolicy.execute({
    feature: "plan-override",
    primaryModel: "primary",
    timeoutMs: 50,
    operation: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 15)),
  }).then((value) => value.ok),
  true,
);
```

- [ ] **Step 2: Add failing client propagation test**

Inject a fake `callPolicy` into `createLangChainDeepSeekClient`, call `invoke({ timeoutMs: 75_000 })`, and assert the policy receives `timeoutMs: 75_000` while the SDK call still receives the abort signal produced by the policy.

- [ ] **Step 3: Add failing plan-service timeout test**

Extend the DeepSeek plan mock call record with `timeoutMs`, then assert:

```js
assert.equal(sentPayload.timeoutMs, 75_000);
```

Add an override server using `DEEPSEEK_PLAN_TIMEOUT_MS: "90000"` and assert its mock receives `90_000`.

- [ ] **Step 4: Verify RED**

Run:

```powershell
node --import tsx tests/ai-call-policy.test.mjs
node --import tsx tests/langchain-llm-client.test.mjs
node --import tsx tests/deepseek-plan.test.mjs
```

Expected: new timeout propagation assertions fail for missing behavior.

- [ ] **Step 5: Implement the minimal timeout path**

Update `createAiCallPolicy.execute` to accept a request-level `timeoutMs?: number` and use `positive(requestTimeoutMs, configuredTimeoutMs)` for `withTimeout`.

Update `createLangChainDeepSeekClient.invoke` to accept `timeoutMs` and pass it to `callPolicy.execute` without adding it to DeepSeek request JSON.

In `deepseek-plan-service.mjs` define:

```js
const DEEPSEEK_PLAN_TIMEOUT_MS = 75_000;
```

Normalize `env.DEEPSEEK_PLAN_TIMEOUT_MS` and pass it only to planning LLM calls. Add to `.env.example`:

```dotenv
DEEPSEEK_PLAN_TIMEOUT_MS=75000
```

- [ ] **Step 6: Verify GREEN**

Run the three targeted commands from Step 4.

Expected: all exit 0; existing global 30-second behavior remains covered and planning receives 75 seconds.

### Task 4: Audit the production-foundation change set

**Files:**
- Review: `server.mjs`, `worker.mjs`, `src/contracts/**`, `src/db/**`, `src/repositories/**`, `src/infrastructure/**`, `src/server/**`, `src/worker/**`
- Review: `Dockerfile`, `compose.yml`, `.dockerignore`, `.github/workflows/verify.yml`, `.env.example`
- Review: modified `src/client/**`, `src/domain/**`, corresponding HTML and tests

- [ ] **Step 1: Run static boundary and drift checks**

Run:

```powershell
npm run check
npm run typecheck
npm run openapi:check
npm run contracts:compat
```

Expected: all exit 0; no generated OpenAPI drift or browser/server contract mismatch.

- [ ] **Step 2: Review high-risk diffs**

Inspect staged candidates with focused diffs for auth/session/CSRF, user ownership, password reset, job cancellation, file paths, proxy trust, rate limiting, logging redaction and migration cutover. Every discovered defect must first receive a focused failing regression test, then the smallest fix, then the targeted test.

- [ ] **Step 3: Confirm fallback invariants**

Use existing tests to prove:

```text
No DATABASE_URL -> SQLite repositories.
No REDIS_URL -> in-memory job store.
No remote object-store config -> local object store.
Fastify routes and native routes preserve browser contracts.
Ordinary users cannot access admin or another user's data.
```

Run the matching repository, infrastructure, Fastify, auth and cross-user tests after each affected review batch.

### Task 5: Run the full local release gates

**Files:**
- Test: all `tests/*.test.mjs`
- Test: `tests/fixtures/**`

- [ ] **Step 1: Full verification**

Run: `npm run verify`

Expected: exit 0 with syntax, contracts, all default tests and retrieval evaluation passing.

- [ ] **Step 2: AI golden evaluation**

Run: `npm run eval:ai`

Expected: all fixture checks pass.

- [ ] **Step 3: Dependency audit**

Run: `npm audit --omit=dev --audit-level=high`

Expected: zero high or critical production vulnerabilities.

- [ ] **Step 4: Docker runtime build**

Run: `docker build --target runtime -t us-college-consultant:release-candidate .`

Expected: image builds successfully and Docker health command is present.

- [ ] **Step 5: Infrastructure contracts**

Run: `npm run test:infra`

Expected: PostgreSQL/pgvector, Redis restart, BullMQ and MinIO tests all execute (not skip) and pass.

### Task 6: Run real AI and browser smoke checks

**Files:**
- Temporary only: `work/prompt-release-eval.*` (never stage)
- Test: production-like local server with a temporary SQLite path

- [ ] **Step 1: Real DeepSeek planning regression**

Use the same synthetic 10th-grade Shenzhen profile from `work/prompt-ab-results.json` and the updated Prompt. Require:

```text
Exactly 15 parsed activities.
No suggested grade earlier than grade 10.
TOEFL 98 remains a total score, never “writing 98”.
Unverified named opportunities are absent or explicitly marked for verification.
Narrative recommends <=4 starting activities within 6 hours/week.
```

Expected: one complete generation satisfies all five checks. If stochastic output violates a rule, strengthen the Prompt and repeat the Prompt TDD cycle before continuing.

- [ ] **Step 2: Local server lifecycle**

Start the server in a hidden background process with a temporary database and recorded PID, poll `/healthz` and `/readyz` with explicit timeouts, run smoke checks, then stop only that PID.

- [ ] **Step 3: Browser desktop/mobile smoke**

At approximately 1280px and 390px verify the home/login flow, course helper, major encyclopedia, Ask DeepSeek and planning entry page. Check primary actions, navigation, overflow and console errors.

Expected: no blocking console error, broken navigation, overlap or inaccessible primary action.

### Task 7: Stage the release safely and create one commit

**Files:**
- Stage: only files allowed by the release design
- Do not stage: historical documentation deletions, `.env`, databases, `work/`, `outputs/`, logs, backups

- [ ] **Step 1: Stage through an explicit whitelist**

Use `git add` with reviewed runtime/config/test/document paths. Do not use blanket `git add -A`.

- [ ] **Step 2: Audit the index**

Run:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git status --short
```

Expected: no secret/local path; no historical document deletion; no `work/` or `outputs/` entry.

- [ ] **Step 3: Secret scan staged content**

Run an installed gitleaks scan when available and a staged-diff pattern scan for API keys, SMTP passwords, cookies, authorization headers and private URLs.

Expected: zero findings. Example placeholders in `.env.example` are allowed only when visibly non-secret.

- [ ] **Step 4: Re-run the release gate on the exact staged state**

Run `npm run verify && npm run eval:ai && npm audit --omit=dev --audit-level=high` without modifying files afterward.

- [ ] **Step 5: Create the single requested commit**

Run:

```powershell
git commit -m "feat: ship production foundation and planning safeguards"
```

Expected: one commit containing the reviewed release; unrelated working-tree files remain unstaged.

### Task 8: Push, review and pass GitHub CI

**Files:**
- External: `origin/codex/ranking-design-alignment`
- External: Pull Request into `main`

- [ ] **Step 1: Push the feature branch**

Run: `git push origin codex/ranking-design-alignment`

Expected: push succeeds and remote branch points at the release commit.

- [ ] **Step 2: Create a non-draft Pull Request**

Create a PR to `main` summarizing architecture, fallbacks, Prompt safeguards, verification and rollback SHA `71f94ea`.

- [ ] **Step 3: Wait for required checks**

Require `quality`, `security`, `docker` and `infrastructure` to finish successfully. Do not merge on pending, skipped unexpectedly, cancelled or failed checks.

- [ ] **Step 4: Merge once green**

Merge the PR and record the resulting `main` SHA.

### Task 9: Deploy and verify Render production

**Files:**
- External: Render service `srv-d8ap70mq1p3s73dpuokg`
- Production: `https://us-application-consultant.com`

- [ ] **Step 1: Deploy the merged main commit**

If Render does not auto-deploy, choose `Manual Deploy` -> `Deploy latest commit`. Do not clear build cache without cache-specific evidence.

- [ ] **Step 2: Monitor deploy**

Wait for the deploy to become `Live` and confirm its Git SHA equals merged `main`. If build/start fails, roll back to `71f94ea`.

- [ ] **Step 3: Production health and readiness**

Verify:

```text
GET https://us-application-consultant.com/healthz -> 200
GET https://us-application-consultant.com/readyz -> 200
```

- [ ] **Step 4: Production browser smoke**

Load the canonical domain, login page and public ranking route at desktop/mobile widths; inspect new console errors and Render logs. Do not create production accounts or mutate student data.

- [ ] **Step 5: Final rollback readiness**

Confirm Render still exposes rollback to the previous live deploy and record the previous deploy ID/SHA in the handoff.

This plan intentionally creates one final commit, overriding the skill's usual frequent-commit preference because the user explicitly requested a single large commit.
