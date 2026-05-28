# Trusted Balanced Brand UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a warm, trustworthy public landing experience around the existing authentication card and visually align the authenticated workspace, resource library, and school encyclopedia without removing functions or changing database behavior.

**Architecture:** Keep the current single-page authentication and workspace switching model in `index.html` and `src/client/app.js`. Add presentation-only sections and CSS tokens/components, plus one small UI interaction for focusing the existing authentication card from the hero CTA. Reuse existing IDs, routes, requests, storage, datasets, and protected-page access rules exactly as they are.

**Tech Stack:** Static HTML/CSS, browser ES modules, Node.js `assert` layout tests, existing local Node server, Codex in-app Browser verification.

---

## Protected Boundaries

- Do not modify: `server.mjs`, `auth-db.mjs`, `auth-service.mjs`, `planning-service.mjs`, `draft-storage.mjs`, any file under `data/`, or database files.
- Do not remove or rename any existing input, button, output, status, or navigation `id`.
- Do not remove existing routes or functionality: authentication, planning generation, plan/snapshot saving, JSON/Word export, resource library, school encyclopedia, GPA calculator, course helper, disclaimer, contact page, or admin dashboard.
- Do not change authentication access rules or expose protected data publicly.
- If a visual improvement conflicts with a current feature, preserve the feature and reduce the visual scope.

## File Map

- Modify `index.html`: wrap the existing authentication form in a public hero/brand landing structure and preserve the entire logged-in workspace.
- Modify `styles.css`: introduce the trusted-balanced palette and new landing/workspace/tool-page component styling.
- Modify `src/client/app.js`: add a single presentation-only event that focuses the existing auth card from the hero CTA.
- Modify `resource-library.html`: apply shared branded header classes and hierarchy without changing filters, tabs, cards, or progressive loading IDs.
- Modify `school-encyclopedia.html`: apply shared branded header classes and hierarchy without changing search, tabs, cards, or progressive loading IDs.
- Modify `tests/planning-workspace-layout.test.mjs`: assert landing sections, required preserved IDs, focus hook, and brand-style contract.
- Modify `tests/resource-library-layout.test.mjs`: assert shared branded header while retaining resource controls.
- Modify `tests/school-encyclopedia-layout.test.mjs`: assert shared branded header while retaining school controls and disclaimer.

### Task 1: Public Landing Structure Contract

**Files:**
- Modify: `tests/planning-workspace-layout.test.mjs`
- Modify: `index.html`

- [ ] **Step 1: Write failing structural assertions**

Extend `tests/planning-workspace-layout.test.mjs` before changing production markup:

```js
for (const id of [
  "landingHeader",
  "heroStartButton",
  "authCard",
  "capabilityHighlights",
  "landingProcess",
  "trustCommitment",
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `Missing public landing element #${id}`);
}

for (const preservedId of [
  "authForm",
  "authSubmitButton",
  "forgotPasswordButton",
  "authModeButton",
  "appShell",
  "generateButton",
  "saveButton",
  "exportButton",
  "exportWordButton",
]) {
  assert.match(html, new RegExp(`id=["']${preservedId}["']`), `Existing capability #${preservedId} must remain`);
}
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: FAIL with `Missing public landing element #landingHeader`.

- [ ] **Step 3: Add the public presentation structure around the existing auth form**

In `index.html`, keep the existing `authForm` and its controls, but replace the simple auth-only wrapper with presentation markup shaped as follows:

```html
<section id="authShell" class="landing-shell" aria-labelledby="landing-title">
  <header id="landingHeader" class="landing-header">
    <a class="brand-mark" href="./index.html" aria-label="US College Compass 首页">
      <span class="brand-prefix">US</span> College Compass
    </a>
    <nav class="landing-nav" aria-label="了解产品">
      <a href="#capabilityHighlights">规划方式</a>
      <a href="#landingProcess">使用流程</a>
      <a href="#trustCommitment">可信承诺</a>
    </nav>
  </header>
  <div class="landing-hero">
    <div class="hero-copy">
      <p class="eyebrow">真实信息 + 个性规划</p>
      <h1 id="landing-title">你的申请路径，<br />真的<span>适合你</span>吗？</h1>
      <p class="hero-description">把学生背景、兴趣方向与院校资料，转化为清晰、可执行、有依据的规划建议。</p>
      <button id="heroStartButton" type="button">免费开始规划</button>
    </div>
    <div id="authCard" class="auth-card">
      <!-- Preserve current auth title, auth form, status and mode buttons here. -->
    </div>
  </div>
  <section id="capabilityHighlights" class="capability-highlights" aria-label="核心能力">
    <!-- Three factual capability cards: 个性规划, 可信资料, 规划报告. -->
  </section>
  <section id="landingProcess" class="landing-process" aria-labelledby="process-title">
    <!-- Three numbered workflow cards. -->
  </section>
  <section id="trustCommitment" class="trust-commitment" aria-labelledby="trust-title">
    <!-- Parent-facing explanation and non-overclaiming trust points. -->
  </section>
</section>
```

Use only factual capability copy already supported by the product. Do not add fabricated user counts, success rates, case testimonials, or admission guarantees.

- [ ] **Step 4: Verify GREEN**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: PASS for landing structure assertions and existing ID preservation assertions.

### Task 2: Hero CTA UI Interaction Contract

**Files:**
- Modify: `tests/planning-workspace-layout.test.mjs`
- Modify: `src/client/app.js`

- [ ] **Step 1: Write failing behavior-source assertion**

Add this assertion before production JavaScript changes:

```js
assert.match(appJs, /const heroStartButton = document\.querySelector\("#heroStartButton"\)/);
assert.match(appJs, /heroStartButton\?\.addEventListener\("click"/);
assert.match(appJs, /authEmailInput\.focus\(\)/);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: FAIL because `heroStartButton` is not yet bound.

- [ ] **Step 3: Implement the smallest presentation-only interaction**

Add one selector beside the current authentication selectors in `src/client/app.js`:

```js
const heroStartButton = document.querySelector("#heroStartButton");
```

Add one event handler beside existing auth UI bindings:

```js
heroStartButton?.addEventListener("click", () => {
  authEmailInput.focus();
});
```

Do not change `submitAuthForm`, `requestJson`, `loadCurrentUser`, `showAuthView`, `showAppView`, or any storage/data logic.

- [ ] **Step 4: Verify GREEN and syntax**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: PASS.

Run: `node --check app.js`  
Expected: PASS.

### Task 3: Trusted-Balanced Visual System And Workspace Polish

**Files:**
- Modify: `tests/planning-workspace-layout.test.mjs`
- Modify: `styles.css`

- [ ] **Step 1: Write failing CSS contract assertions**

Add assertions before changing CSS:

```js
for (const token of ["--brand-green", "--brand-orange", "--surface-warm", "--radius-card"]) {
  assert.match(styles, new RegExp(token), `Missing trusted-balanced style token ${token}`);
}
for (const selector of [
  ".landing-shell",
  ".landing-header",
  ".landing-hero",
  ".capability-highlights",
  ".landing-process",
  ".trust-commitment",
]) {
  assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing style ${selector}`);
}
assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.landing-hero/, "Landing hero should stack on small screens.");
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: FAIL with a missing style token or landing selector.

- [ ] **Step 3: Add style tokens and public landing components**

Update `:root` in `styles.css` with a warm, trustworthy system while retaining existing semantic variable use:

```css
:root {
  --bg: #fbfaf5;
  --panel: #ffffff;
  --ink: #19233a;
  --muted: #637084;
  --line: #e4e5dc;
  --accent: #328263;
  --accent-strong: #206248;
  --brand-green: #3a916c;
  --brand-orange: #eca62f;
  --surface-warm: #fffaf0;
  --surface-green: #edf5f0;
  --surface-blue: #eef4fa;
  --radius: 12px;
  --radius-card: 18px;
}
```

Add focused styles for:

```css
.landing-shell { min-height: 100vh; background: var(--surface-warm); }
.landing-header { display: flex; justify-content: space-between; align-items: center; }
.landing-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 430px); }
.hero-copy h1 span { color: var(--brand-green); }
#heroStartButton,
.auth-form button[type="submit"] { background: var(--brand-orange); border-color: var(--brand-orange); }
.capability-highlights,
.process-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.trust-commitment { border: 1px solid var(--line); background: var(--panel); }
```

Restyle existing `.panel`, `.workspace-panel`, `.workspace-card`, `.status`, `.resource-card`, and `.school-card` only through presentation properties such as color, background, border radius, border, padding and shadow. Do not hide, remove, or disable current controls.

- [ ] **Step 4: Add mobile stacking rules**

Within the existing `@media (max-width: 780px)` block, add:

```css
.landing-header,
.landing-hero,
.capability-highlights,
.process-grid {
  display: grid;
  grid-template-columns: 1fr;
}

.landing-nav {
  flex-wrap: wrap;
}
```

- [ ] **Step 5: Verify GREEN**

Run: `node tests/planning-workspace-layout.test.mjs`  
Expected: PASS.

### Task 4: Shared Brand Header For Protected Browse Pages

**Files:**
- Modify: `tests/resource-library-layout.test.mjs`
- Modify: `tests/school-encyclopedia-layout.test.mjs`
- Modify: `resource-library.html`
- Modify: `school-encyclopedia.html`
- Modify: `styles.css`

- [ ] **Step 1: Write failing header preservation assertions**

Add to `tests/resource-library-layout.test.mjs`:

```js
assert.match(html, /class="[^"]*brand-page-header[^"]*"/, "Resource page should use the shared brand header.");
assert.ok(html.includes('href="./index.html"'), "Resource page must retain access to the planning workspace.");
assert.ok(html.includes('id="resourceEligibilityForm"') && html.includes('id="loadMoreResources"'));
```

Add to `tests/school-encyclopedia-layout.test.mjs`:

```js
assert.match(pageHtml, /class="[^"]*brand-page-header[^"]*"/, "School page should use the shared brand header.");
assert.ok(pageHtml.includes('href="./index.html"'), "School page must retain access to the planning workspace.");
assert.ok(pageHtml.includes('id="schoolSearch"') && pageHtml.includes('id="loadMoreSchools"'));
```

- [ ] **Step 2: Run the tests to verify RED**

Run: `node tests/resource-library-layout.test.mjs`  
Expected: FAIL because the brand header class does not exist.

Run: `node tests/school-encyclopedia-layout.test.mjs`  
Expected: FAIL because the brand header class does not exist.

- [ ] **Step 3: Apply shared presentational header markup**

In both pages, preserve their existing links and IDs while adding branded wrapper classes:

```html
<header class="topbar brand-page-header">
  <div class="brand-page-identity">
    <a class="brand-mark" href="./index.html" data-safe-nav>
      <span class="brand-prefix">US</span> College Compass
    </a>
    <!-- Preserve page-specific eyebrow and h1 text. -->
  </div>
  <div class="actions" aria-label="页面操作">
    <!-- Preserve existing page actions and href targets. -->
  </div>
</header>
```

Add only presentation CSS for `.brand-page-header` and `.brand-page-identity`. Do not change filters, tab controls, load-more controls, source explanations, or page scripts.

- [ ] **Step 4: Verify GREEN**

Run: `node tests/resource-library-layout.test.mjs`  
Expected: PASS.

Run: `node tests/school-encyclopedia-layout.test.mjs`  
Expected: PASS.

### Task 5: Non-Regression And Browser Verification

**Files:**
- Verify only the UI files and test files identified in this plan.
- Confirm protected files remain untouched by this implementation.

- [ ] **Step 1: Review implementation file scope**

Run:

```powershell
git diff --name-only -- index.html styles.css app.js resource-library.html school-encyclopedia.html tests/planning-workspace-layout.test.mjs tests/resource-library-layout.test.mjs tests/school-encyclopedia-layout.test.mjs
git diff --name-only -- server.mjs auth-db.mjs auth-service.mjs planning-service.mjs draft-storage.mjs data
```

Expected: the first command lists intended UI/test changes; the second command contains no new edits from this UI implementation.

- [ ] **Step 2: Run syntax and behavior regression checks**

Run: `npm.cmd run check`  
Expected: exit code `0`.

Run: `npm.cmd test`  
Expected: exit code `0`, including existing authentication, planning, export, resource, and school tests.

- [ ] **Step 3: Start or reuse local app and perform browser checks**

Use the existing local server URL when available. At desktop width verify:

- The public landing page displays the brand hero, factual capability cards, trust section, and existing auth form.
- Clicking `免费开始规划` focuses the current authentication form.
- Registration/login/forgot-password controls remain present.
- A successful authenticated session shows the pre-existing planning workspace sections and actions.
- Resource library and school encyclopedia maintain their search/filter/load-more/detail behavior with the branded header.

At mobile width verify:

- Hero and auth card stack without horizontal overflow.
- Main CTA, form labels and status messages remain usable.
- Workspace and browse-page actions remain reachable.

- [ ] **Step 4: Report preserved scope**

In the completion report explicitly state that UI changes were confined to the presentation files in this plan and that no database or service-layer file was altered for this redesign.

