import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pages = [
  ["index.html", "申请规划中心"],
  ["my-activities.html", "我的申请档案"],
  ["school-selection.html", "美本选校系统"],
  ["ask-deepseek.html", "问DeepSeek"],
  ["resource-library.html", "资源库"],
  ["school-encyclopedia.html", "院校百科"],
  ["major-encyclopedia.html", "专业百科"],
  ["gpa-calculator.html", "GPA / AP 工具"],
  ["course-helper.html", "选课辅助器"],
  ["feedback.html", "反馈与支持"],
  ["contact.html", "联系我们"],
  ["disclaimer.html", "免责声明"],
  ["admin.html", "数据看板"],
];

const indexHtml = readFileSync("index.html", "utf8");
const styles = readFileSync("styles.css", "utf8");
const courseHelperHtml = readFileSync("course-helper.html", "utf8");
const courseHelperScript = readFileSync("src/client/course-helper.js", "utf8");
const safeNavigationScript = readFileSync("src/client/safe-navigation.mjs", "utf8");

const authShell = indexHtml.match(/<section id="authShell"[\s\S]*?<\/section>\s*<main id="appShell"/)?.[0] || "";
assert.ok(authShell.includes("landing-shell"), "Public landing shell should remain the public landing design.");
assert.ok(!authShell.includes("command-sidebar"), "Public landing shell should not receive the logged-in command sidebar.");
assert.ok(indexHtml.includes('<main id="appShell" class="app-shell command-shell is-hidden">'));
assert.ok(indexHtml.includes("<h1>申请规划中心</h1>"), "Logged-in home title should be 申请规划中心.");
assert.ok(!indexHtml.includes("美本申请规划 Agent"), "Logged-in home should not use the old Agent title.");
assert.ok(!indexHtml.includes("Automation Status"), "Logged-in home should not show the removed automation status board.");
assert.ok(!indexHtml.includes('class="command-center-hero"'), "Logged-in home should not render the removed automation status board.");
assert.ok(!indexHtml.includes("Planning Readiness"), "Logged-in home should not show the removed readiness card.");
assert.ok(
  indexHtml.includes('./src/client/app.js?v=20260602-deepseek-wait-time'),
  "Logged-in shell should cache-bust the main app module with the current DeepSeek wait-time release.",
);
assert.ok(
  !indexHtml.includes('./src/client/app.js?v=20260531-svg-only'),
  "Logged-in shell should not keep serving the previous app module cache key.",
);
assert.match(
  courseHelperHtml,
  /src="\.\/src\/client\/course-helper\.js\?v=20260602-ap-rigor"/,
  "Course helper page should cache-bust AP rigor planning updates.",
);
assert.match(
  courseHelperScript,
  /from "\.\.\/domain\/ap-course-recommender\.mjs\?v=20260602-ap-rigor"/,
  "Course helper should cache-bust the AP recommender module after rigor rule updates.",
);

for (const [file, activeLabel] of pages) {
  const html = readFileSync(file, "utf8");
  assert.match(html, /<main[^>]*class="[^"]*\bapp-shell\b[^"]*\bcommand-shell\b/, `${file} should use command shell layout.`);
  assert.ok(html.includes('class="command-sidebar"'), `${file} should include the command sidebar.`);
  assert.ok(html.includes('class="command-main"'), `${file} should wrap page content in command-main.`);
  assert.ok(html.includes("./assets/logo-mark.svg"), `${file} should preserve the current logo mark.`);
  assert.match(
    html,
    /\.\/styles\.css\?v=20260602-[a-z0-9-]+/,
    `${file} should load the cache-busted command center stylesheet.`,
  );
  assert.ok(html.includes("US College Compass"), `${file} should preserve the current brand name.`);
  assert.ok(html.includes("Application Planning Center"), `${file} should position the logged-in product as a planning center.`);
  assert.ok(html.includes(`aria-current="page">${activeLabel}`), `${file} should mark ${activeLabel} as the active command nav item.`);
  for (const navLabel of ["申请规划中心", "我的申请档案", "美本选校系统", "资源库", "院校百科", "专业百科", "选课辅助器", "GPA / AP 工具", "免责声明", "反馈与支持", "联系我们"]) {
    assert.ok(html.includes(navLabel), `${file} should include command nav label ${navLabel}.`);
  }
  const commandNav = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  for (const section of ["core", "reference", "academic", "support"]) {
    assert.ok(
      commandNav.includes(`data-nav-section="${section}"`),
      `${file} should group the left navigation into a ${section} section.`,
    );
  }
  assert.ok(
    commandNav.indexOf('data-nav-section="core"') < commandNav.indexOf('data-nav-section="reference"')
      && commandNav.indexOf('data-nav-section="reference"') < commandNav.indexOf('data-nav-section="academic"')
      && commandNav.indexOf('data-nav-section="academic"') < commandNav.indexOf('data-nav-section="support"'),
    `${file} should order navigation groups by workflow, references, academic tools, then support.`,
  );
  if (file !== "admin.html") {
    assert.ok(
      commandNav.includes('data-admin-dashboard-link') && commandNav.includes('href="./admin.html"'),
      `${file} should keep a hidden admin dashboard nav entry that can be revealed for admin users.`,
    );
    assert.ok(
      html.includes('./src/client/admin-nav.js?v=20260602-mobile-drawer'),
      `${file} should load the shared admin nav visibility script.`,
    );
  }
  assert.ok(
    commandNav.indexOf("院校百科") < commandNav.indexOf("专业百科")
      && commandNav.indexOf("专业百科") < commandNav.indexOf("选课辅助器")
      && commandNav.indexOf("选课辅助器") < commandNav.indexOf("GPA / AP 工具")
      && commandNav.indexOf("GPA / AP 工具") < commandNav.indexOf("免责声明")
      && commandNav.indexOf("免责声明") < commandNav.indexOf("反馈与支持")
      && commandNav.indexOf("反馈与支持") < commandNav.indexOf("联系我们"),
    `${file} should keep the expanded command navigation in the requested order.`,
  );
}

const loggedInHeader = indexHtml.match(/<header class="topbar brand-page-header logged-in-header"[\s\S]*?<\/header>/)?.[0] || "";
assert.ok(!loggedInHeader.includes("title-link-group"), "Logged-in home header should not repeat navigation buttons.");
assert.ok(!loggedInHeader.includes("GPA计算器"), "Logged-in home header should not show utility navigation buttons.");

const adminNavScript = readFileSync("src/client/admin-nav.js", "utf8");
assert.match(adminNavScript, /\/api\/auth\/me/, "Admin nav script should check the authenticated user.");
assert.match(adminNavScript, /role === "admin"/, "Admin nav script should reveal dashboard links only for admins.");
assert.match(adminNavScript, /data-admin-dashboard-link/, "Admin nav script should target shared admin dashboard links.");
assert.match(adminNavScript, /function getAdminDashboardLinks/, "Admin nav script should include links cloned into the mobile drawer.");
assert.match(safeNavigationScript, /setupCommandMobileNavigation/, "Safe navigation should build the mobile command drawer.");
assert.match(safeNavigationScript, /data-command-mobile-toggle/, "Mobile command drawer should expose an accessible toggle.");
assert.match(safeNavigationScript, /getCurrentCommandTitle/, "Mobile command bar should show the current page title.");

for (const selector of [
  ".command-shell",
  ".command-sidebar",
  ".command-main",
  ".command-page-summary",
  ".next-action-panel",
  ".command-mobile-bar",
  ".command-mobile-drawer",
]) {
  assert.ok(styles.includes(selector), `Stylesheet should define ${selector}.`);
}

assert.match(
  styles,
  /\.command-sidebar\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/,
  "Command sidebar should reserve a scrollable middle navigation track.",
);
assert.match(
  styles,
  /\.command-sidebar-nav\s*\{[\s\S]*?overflow-y:\s*auto;/,
  "Command sidebar navigation should scroll vertically when entries exceed the viewport.",
);
assert.match(
  styles,
  /\.command-sidebar-nav\s*\{[\s\S]*?scrollbar-width:\s*auto;/,
  "Command sidebar navigation should use a full-size draggable scrollbar instead of a thin hidden-feeling rail.",
);
assert.match(
  styles,
  /\.command-sidebar-nav\s*\{[\s\S]*?scrollbar-color:\s*rgba\(32,\s*98,\s*72,\s*0\.7\)\s*rgba\(216,\s*229,\s*223,\s*0\.95\);/,
  "Command sidebar navigation should expose a visible scrollbar thumb and track.",
);
assert.match(
  styles,
  /\.command-sidebar-nav::-webkit-scrollbar-thumb\s*\{/,
  "Command sidebar navigation should expose a visible scrollbar handle.",
);
assert.match(
  styles,
  /\.command-sidebar-nav::-webkit-scrollbar\s*\{[\s\S]*?width:\s*12px;/,
  "Command sidebar navigation should make the scrollbar wide enough to drag comfortably.",
);
assert.match(
  styles,
  /\.command-sidebar-nav::-webkit-scrollbar-track\s*\{[\s\S]*?background:\s*rgba\(216,\s*229,\s*223,\s*0\.95\);/,
  "Command sidebar navigation should draw a persistent scrollbar track line.",
);

assert.match(styles, /--brand-green:\s*#287250;/, "Brand green should be preserved.");
assert.match(styles, /--brand-orange:\s*#a86400;/, "Brand orange should be preserved.");
assert.ok(!styles.includes("background: #172033;"), "Command shell should not use the old dark navy background blocks.");
