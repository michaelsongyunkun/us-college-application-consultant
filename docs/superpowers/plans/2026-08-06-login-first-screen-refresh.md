# Login First-Screen Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unauthenticated homepage first screen with a distinctive “Admissions Desk” layout while preserving every existing authentication state and backend contract.

**Architecture:** Reorganize only the `authShell` header and hero markup in `index.html`, then add one high-specificity, page-scoped style block at the end of `styles.css`. Keep all authentication element IDs and `src/client/app.js` request behavior unchanged so native POST fallback, server-side `?auth=login` rendering, password reset, CSRF, and session handling continue to work.

**Tech Stack:** Static HTML, CSS, browser ESM, native Node.js tests, browser smoke checks.

---

## File map

- Modify `index.html`: first-screen information hierarchy and admissions-path preview.
- Modify `styles.css`: scoped desktop/mobile design and reduced-motion treatment.
- Modify `tests/planning-workspace-layout.test.mjs`: structural and copy contract.
- Preserve `src/client/app.js`: its authentication mode and focus behavior already cover the new structure.

### Task 1: Lock the refreshed first-screen contract

**Files:**
- Modify: `tests/planning-workspace-layout.test.mjs`
- Test: `tests/planning-workspace-layout.test.mjs`

- [ ] **Step 1: Add failing structure and copy assertions**

Add the new IDs to the public landing-element loop:

```js
for (const id of [
  "landingHeader",
  "heroStartButton",
  "authCard",
  "compassPath",
  "compassPathProfile",
  "compassPathEvidence",
  "compassPathDecisions",
  "capabilityHighlights",
  "loggedInPreview",
  "landingProcess",
  "hallucinationRisk",
  "audienceFit",
  "trustCommitment",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing public landing element #${id}`);
}

for (const copy of [
  "从散落信息，",
  "到有依据的申请决策",
  "开始整理我的申请",
  "Profile",
  "Evidence",
  "Decisions",
]) {
  assert.ok(html.includes(copy), `Expected refreshed first-screen copy: ${copy}`);
}

assert.match(styles, /\.landing-shell-v3\s+\.landing-hero/);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.landing-shell-v3\s+\.auth-card/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
```

- [ ] **Step 2: Run the page contract and verify it fails**

Run `node tests/planning-workspace-layout.test.mjs`.

Expected: FAIL because `#compassPath` and the new headline do not exist.

- [ ] **Step 3: Commit the test contract**

```powershell
git add tests/planning-workspace-layout.test.mjs
git commit -m "test: define refreshed login first screen"
```

### Task 2: Restructure the unauthenticated hero

**Files:**
- Modify: `index.html:20-105`
- Test: `tests/planning-workspace-layout.test.mjs`

- [ ] **Step 1: Add the scoped shell class**

```html
<section id="authShell" class="landing-shell landing-shell-v3" aria-labelledby="landing-title">
```

Keep the existing header ID, brand link, logo, and anchor destinations. Rename the four visible nav labels to `工作方式`、`工作区能力`、`AI 核验`、`适用边界`.

- [ ] **Step 2: Replace the left hero with the Admissions Desk path**

Keep `#landing-title` and `#heroStartButton`, then use:

```html
<div class="hero-copy">
  <p class="eyebrow">US APPLICATION WORKSPACE</p>
  <h1 id="landing-title">从散落信息，<br /><span>到有依据的申请决策</span></h1>
  <p class="hero-description">把成绩、课程、活动与目标方向整理进同一套工作区，再用资料核验、能力评估和选校规划把信息变成下一步行动。</p>
  <button id="heroStartButton" type="button">开始整理我的申请</button>
  <div id="compassPath" class="compass-path" aria-label="从学生档案到申请决策的工作路径">
    <div class="compass-path-head"><span>COMPASS PATH</span><small>信息 → 证据 → 决策</small></div>
    <div class="compass-path-track">
      <article id="compassPathProfile" class="compass-path-stage is-current">
        <span class="compass-path-code">Profile</span><strong>建立学生档案</strong><p>成绩、课程、活动与目标方向</p>
      </article>
      <article id="compassPathEvidence" class="compass-path-stage">
        <span class="compass-path-code">Evidence</span><strong>核对申请证据</strong><p>能力评估、资源与院校资料</p>
      </article>
      <article id="compassPathDecisions" class="compass-path-stage">
        <span class="compass-path-code">Decisions</span><strong>形成申请决策</strong><p>选校轮次、规划版本与行动</p>
      </article>
    </div>
    <div class="auth-preview-report" aria-label="工作区输出预览">
      <span><strong>Assess</strong><small>档案能力证据</small></span>
      <span><strong>Compare</strong><small>院校与资源核验</small></span>
      <span><strong>Act</strong><small>本周下一步行动</small></span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Simplify the authentication card without changing its contract**

Remove the old `.auth-preview-map` block from `#authCard`. Preserve the complete form and all IDs, and use this top and bottom framing:

```html
<div id="authCard" class="auth-card">
  <div class="auth-card-head">
    <p class="eyebrow">ACCOUNT WORKSPACE</p>
    <span>核心功能可使用</span>
  </div>
  <h2 id="auth-title">领取你的申请行动地图</h2>
  <p class="auth-copy">登录或创建账户，继续管理申请档案、规划版本、选校与进度。</p>
  <!-- Keep the existing #authForm and mode buttons exactly. -->
  <p class="auth-card-footnote">账号用于保存你的工作区内容。AI 建议仍需结合官方信息人工核验。</p>
</div>
```

- [ ] **Step 4: Update the stylesheet query to `styles.css?v=20260806-login-first-screen`**

- [ ] **Step 5: Run structural tests**

```powershell
node tests/planning-workspace-layout.test.mjs
node tests/static-file-service.test.mjs
node tests/server-auth.test.mjs
```

Expected: PASS after updating only stale presentation assertions. All auth behavior assertions remain unchanged.

### Task 3: Build the scoped visual system

**Files:**
- Modify: `styles.css` (append one scoped block)
- Test: `tests/planning-workspace-layout.test.mjs`

- [ ] **Step 1: Add desktop tokens and the 60/40 layout**

```css
.landing-shell-v3 {
  --login-ink: #10243a;
  --login-paper: #f5f3ec;
  --login-white: #fff;
  --login-green: #246b4b;
  --login-amber: #d97716;
  --login-blue: #dceaf4;
  min-height: 100vh;
  background-color: var(--login-paper);
  background-image:
    linear-gradient(rgba(16, 36, 58, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 36, 58, 0.035) 1px, transparent 1px);
  background-size: 32px 32px;
}

.landing-shell-v3 .landing-hero {
  grid-template-columns: minmax(0, 1.3fr) minmax(360px, 0.82fr);
  gap: clamp(44px, 6vw, 92px);
  align-items: center;
  min-height: calc(100vh - 150px);
}

.landing-shell-v3 .auth-card {
  width: 100%;
  max-width: 430px;
  border: 1px solid rgba(16, 36, 58, 0.15);
  border-radius: 10px 28px 10px 10px;
  background: var(--login-white);
  box-shadow: 18px 18px 0 rgba(36, 107, 75, 0.1);
}
```

Add the route line with `.compass-path-track::before` and labeled nodes with `.compass-path-stage::before`. Use amber for Profile, green for Evidence, and ink for Decisions. All secondary surfaces remain flat and bordered.

- [ ] **Step 2: Add focus and status states**

```css
.landing-shell-v3 .auth-form input:focus-visible,
.landing-shell-v3 button:focus-visible,
.landing-shell-v3 a:focus-visible {
  outline: 3px solid rgba(217, 119, 22, 0.35);
  outline-offset: 3px;
}

.landing-shell-v3 .auth-status:not(:empty) {
  border-left: 3px solid var(--login-amber);
  background: #fff8ed;
  padding: 10px 12px;
}
```

- [ ] **Step 3: Add responsive order rules**

At `980px`, collapse to one column. At `760px`, use a flex hero and `display: contents` on `.hero-copy` so the visible order becomes title/description → auth card → Compass path. Hide the redundant `#heroStartButton` only on mobile and change the path to one column.

```css
@media (max-width: 760px) {
  .landing-shell-v3 .landing-hero { display: flex; flex-direction: column; gap: 24px; }
  .landing-shell-v3 .hero-copy { display: contents; }
  .landing-shell-v3 .hero-copy > .eyebrow,
  .landing-shell-v3 .hero-copy > h1,
  .landing-shell-v3 .hero-copy > .hero-description { order: 1; }
  .landing-shell-v3 .auth-card { order: 2; }
  .landing-shell-v3 #heroStartButton { display: none; }
  .landing-shell-v3 .compass-path { order: 3; }
  .landing-shell-v3 .compass-path-track { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Respect reduced motion**

```css
@media (prefers-reduced-motion: reduce) {
  .landing-shell-v3 .compass-path-stage,
  .landing-shell-v3 .auth-card { animation: none; transition: none; }
}
```

- [ ] **Step 5: Run focused tests**

Run the same three commands from Task 2. Expected: PASS.

### Task 4: Verify behavior and visual quality

**Files:**
- Verify: `index.html`, `styles.css`, `src/client/app.js`

- [ ] **Step 1: Run `npm run check` and the three focused tests**

Expected: PASS.

- [ ] **Step 2: Run `npm run verify`**

Expected: PASS. If only `eval:rag-relevance` misses its 2-second absolute latency ceiling while all relevance metrics pass, record the measured latency as the existing environmental exception.

- [ ] **Step 3: Start a bounded hidden local server on an explicit unused port**

Record the exact PID, poll `/` until ready, and never kill unrelated Node processes.

- [ ] **Step 4: Check desktop at 1280px**

Confirm the first viewport contains the headline, complete auth form, continuous Compass path, and no overlapping or clipped text. Exercise register/login mode switching and forgot-password mode without submitting real credentials.

- [ ] **Step 5: Check mobile at 390px**

Confirm the sequence is headline → auth card → Compass path, the form and mode buttons remain reachable, and there is no horizontal overflow.

- [ ] **Step 6: Check console and accessibility basics**

Confirm no console-breaking errors, inputs have visible labels, focus outlines are visible, and reduced-motion CSS is present.

- [ ] **Step 7: Stop only the recorded local server PID**

- [ ] **Step 8: Review the final diff**

```powershell
git diff --check
git status --short
```

Do not stage `disclaimer.html` or `tests/disclaimer-content.test.mjs`; those are pre-existing changes from the preceding task.

## Plan self-review

- Spec coverage: desktop structure, mobile order, auth-state preservation, accessibility, reduced motion, full verification, and two-width browser checks each have a step.
- Placeholder scan: no implementation step contains a deferred design decision.
- Consistency: tests and markup use the same IDs; the scoped root is always `landing-shell-v3`; no task modifies authentication services.
