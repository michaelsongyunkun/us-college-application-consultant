import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appPages = [
  "index.html",
  "my-activities.html",
  "school-selection.html",
  "ask-deepseek.html",
  "resource-library.html",
  "school-encyclopedia.html",
  "major-encyclopedia.html",
  "course-helper.html",
  "gpa-calculator.html",
  "disclaimer.html",
  "feedback.html",
  "contact.html",
];

for (const page of appPages) {
  const html = readFileSync(page, "utf8");
  const navigation = html.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.ok(
    navigation.includes('href="./school-selection.html"'),
    `${page} sidebar should include the school selection entry.`,
  );
  assert.ok(
    navigation.indexOf("my-activities.html") < navigation.indexOf("school-selection.html")
      && navigation.indexOf("school-selection.html") < navigation.indexOf("ask-deepseek.html"),
    `${page} sidebar should place school selection between portfolio and Ask DeepSeek.`,
  );
}

const pageHtml = readFileSync("school-selection.html", "utf8");
const script = readFileSync("src/client/school-selection.js", "utf8");
const styles = readFileSync("styles.css", "utf8");

for (const expected of [
  "美本选校系统",
  "用户国籍",
  "用户高中地区",
  "REA / ED1",
  "ED2",
  "EA",
  "RD",
  "UC",
  'id="schoolSelectionForm"',
  'id="selectionNationality"',
  'id="selectionHighSchoolRegion"',
  'id="selectionTargetMajor"',
  'id="selectionBudgetSensitivity"',
  'id="selectionRegionPreference"',
  'id="selectionCampusSetting"',
  'id="selectionSchoolSize"',
  'id="selectionEdRiskTolerance"',
  'id="selectionScholarshipNeed"',
  'id="selectionStrategyMode"',
  'id="selectionPreferences"',
  'id="generateSchoolSelectionButton"',
  'id="saveSchoolSelectionButton"',
  'id="exportSchoolSelectionSvgButton"',
  'id="exportSchoolSelectionWordButton"',
  'id="schoolSelectionVersionList"',
  'id="schoolSelectionStatus"',
  'id="schoolSelectionResults"',
  "大约需要 2 分钟",
  "保存为选校版本",
  "\u5bfc\u51faSVG",
  "\u5bfc\u51faWord\u6587\u6863",
  "./assets/logo-mark.svg",
  "./styles.css?v=20260602-mobile-workbench",
  "./src/client/school-selection.js?v=20260602-selection-svg-word",
]) {
  assert.ok(pageHtml.includes(expected), `School selection page should include ${expected}.`);
}
assert.ok(!pageHtml.includes(">导出结果<"), "School selection should replace the old generic export label.");

assert.ok(script.includes('"/api/school-selection"'), "School selection page should call the dedicated API.");
assert.ok(script.includes("renderSchoolSelectionResults"), "School selection page should render grouped results.");
assert.ok(script.includes("selectionNationality"), "School selection page should read nationality.");
assert.ok(script.includes("selectionHighSchoolRegion"), "School selection page should read high school region.");
assert.ok(script.includes("selectionTargetMajor"), "School selection page should read structured target major preference.");
assert.ok(script.includes("selectionStrategyMode"), "School selection page should read conservative/balanced/aggressive version mode.");
assert.ok(script.includes("saveSchoolSelectionToPortfolio"), "School selection should save edited results into my application portfolio.");
assert.ok(script.includes("saveSchoolSelectionVersion"), "School selection should save versioned school selection plans.");
assert.ok(script.includes("deleteSchoolSelectionVersion"), "School selection should let users delete saved selection versions.");
assert.ok(script.includes("data-delete-school-selection-version"), "Saved selection versions should expose a delete action.");
assert.ok(script.includes("exportSchoolSelectionSvg"), "School selection should export the edited school selection result as SVG.");
assert.ok(script.includes("exportSchoolSelectionWord"), "School selection should export the edited school selection result as Word.");
assert.ok(script.includes("buildSchoolSelectionSvgDocument"), "School selection should build a dedicated SVG document.");
assert.ok(script.includes("buildSchoolSelectionWordDocument"), "School selection should build a dedicated Word document.");
assert.ok(script.includes("image/svg+xml;charset=utf-8"), "School selection SVG export should use the correct MIME type.");
assert.ok(script.includes("application/msword;charset=utf-8"), "School selection Word export should use the correct MIME type.");
assert.ok(script.includes("renderSchoolSelectionVersions"), "School selection should show saved versions for review.");
assert.ok(script.includes("collectEditedSelection"), "School selection should collect edited school results before saving.");
assert.ok(script.includes('"/api/my-activities"'), "School selection should load and save the application portfolio.");
assert.ok(script.includes("renderStrategySummary"), "School selection should show an application strategy summary.");
assert.ok(script.includes("REA / ED1"), "School selection page should label the mutually exclusive early bucket.");
assert.ok(script.includes("3-5所"), "School selection page should explain the EA count range.");
assert.ok(script.includes("8-12所"), "School selection page should explain the RD count range.");
assert.doesNotMatch(script, /deepSeekApiKey/i, "School selection should not expose a user DeepSeek API key field.");

for (const selector of [
  ".school-selection-shell",
  ".school-selection-form",
  ".school-selection-results",
  ".school-selection-round",
  ".school-selection-card",
]) {
  assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `Missing style ${selector}`);
}

assert.match(
  styles,
  /\.school-selection-panel\s+\.section-heading\s*,\s*\.school-selection-results-panel\s+\.section-heading\s*\{[\s\S]*?border-bottom:\s*1px solid/,
  "School selection panels should separate headers from content without causing text to touch card edges.",
);
assert.match(
  styles,
  /\.school-selection-form\s*\{[\s\S]*?padding:\s*24px 30px 30px;/,
  "School selection form should have dedicated inner padding.",
);
assert.match(
  styles,
  /\.school-selection-form\s+label\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*8px;/,
  "School selection labels should have a tidy stacked layout.",
);
assert.match(
  styles,
  /\.school-selection-results\s*\{[\s\S]*?padding:\s*24px 30px 30px;/,
  "School selection results should have dedicated inner padding.",
);
