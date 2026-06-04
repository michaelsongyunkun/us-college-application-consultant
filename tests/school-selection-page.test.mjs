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
  'class="school-selection-essential-grid"',
  'class="school-selection-advanced full-span"',
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
  "./styles.css?v=20260604-school-selection-layout",
  "./src/client/school-selection.js?v=20260603-admission-probability",
]) {
  assert.ok(pageHtml.includes(expected), `School selection page should include ${expected}.`);
}
assert.ok(!pageHtml.includes(">导出结果<"), "School selection should replace the old generic export label.");
assert.ok(
  pageHtml.indexOf('class="school-selection-essential-grid"') < pageHtml.indexOf('class="school-selection-advanced full-span"'),
  "School selection form should ask for essential inputs before optional advanced preferences.",
);
const advancedPreferences = pageHtml.match(/<details class="school-selection-advanced full-span"[\s\S]*?<\/details>/)?.[0] || "";
for (const advancedField of [
  'id="selectionBudgetSensitivity"',
  'id="selectionRegionPreference"',
  'id="selectionCampusSetting"',
  'id="selectionSchoolSize"',
  'id="selectionEdRiskTolerance"',
  'id="selectionScholarshipNeed"',
  'id="selectionPreferences"',
]) {
  assert.ok(advancedPreferences.includes(advancedField), `Advanced preference drawer should contain ${advancedField}.`);
}
assert.ok(
  !advancedPreferences.includes('id="selectionNationality"') && !advancedPreferences.includes('id="selectionHighSchoolRegion"'),
  "Required generation fields should remain outside the advanced preference drawer.",
);

assert.ok(script.includes('"/api/school-selection-jobs"'), "School selection page should create a background generation job.");
assert.ok(script.includes("waitForSchoolSelectionJob"), "School selection page should poll the background job for results.");
assert.ok(
  !script.includes('requestJson("/api/school-selection"'),
  "School selection generation should not depend on one long synchronous browser request.",
);
assert.ok(script.includes("renderSchoolSelectionResults"), "School selection page should render grouped results.");
assert.ok(script.includes("admissionProbability"), "School selection should render and collect estimated admission probability ranges.");
assert.ok(script.includes('class="school-selection-major-field"'), "School selection major field should have a dedicated layout hook.");
assert.ok(script.includes('class="school-selection-probability-field"'), "School selection admission probability field should have a dedicated layout hook.");
assert.ok(script.includes("录取概率区间"), "School selection should label admission probability as a range.");
assert.ok(script.includes("非录取承诺"), "School selection should clarify that probability ranges are not admission guarantees.");
assert.ok(script.includes("selectionNationality"), "School selection page should read nationality.");
assert.ok(script.includes("selectionHighSchoolRegion"), "School selection page should read high school region.");
assert.ok(script.includes("selectionTargetMajor"), "School selection page should read structured target major preference.");
assert.ok(script.includes("selectionStrategyMode"), "School selection page should read conservative/balanced/aggressive version mode.");
assert.ok(script.includes("saveSchoolSelectionToPortfolio"), "School selection should save edited results into my application portfolio.");
assert.ok(script.includes("saveSchoolSelectionVersion"), "School selection should save versioned school selection plans.");
assert.ok(script.includes("multiCountry"), "Saving US school-selection versions should preserve multi-country backup schools.");
assert.ok(
  script.includes("buildApplicationPlan(selection, portfolio.applicationPlan"),
  "School selection should merge generated US rounds with the existing portfolio plan instead of replacing overseas backups.",
);
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
assert.ok(script.includes("trackSchoolSelectionUsageEvent"), "School selection should record key usage events.");
assert.ok(script.includes("school_selection_generate_success"), "School selection should track successful generation.");
assert.ok(script.includes("school_selection_generate_failure"), "School selection should track failed generation.");
assert.ok(script.includes("school_selection_save"), "School selection should track saves into the portfolio.");
assert.ok(script.includes("school_selection_export_svg"), "School selection should track SVG exports separately.");
assert.ok(script.includes("school_selection_export_word"), "School selection should track Word exports separately.");
assert.ok(script.includes("renderStrategySummary"), "School selection should show an application strategy summary.");
assert.ok(script.includes("REA / ED1"), "School selection page should label the mutually exclusive early bucket.");
assert.ok(script.includes("3-5所"), "School selection page should explain the EA count range.");
assert.ok(script.includes("8-12所"), "School selection page should explain the RD count range.");
assert.doesNotMatch(script, /deepSeekApiKey/i, "School selection should not expose a user DeepSeek API key field.");

for (const selector of [
  ".school-selection-shell",
  ".school-selection-form",
  ".school-selection-essential-grid",
  ".school-selection-advanced",
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
  /\.school-selection-essential-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
  "School selection essential fields should use a concise two-column grid on desktop.",
);
assert.match(
  styles,
  /\.school-selection-advanced summary\s*\{[\s\S]*?min-height:\s*48px;/,
  "Advanced preference drawer should use a comfortable touch target.",
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
assert.match(
  styles,
  /\.school-selection-card-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*300px\),\s*1fr\)\);/,
  "School selection cards should not shrink below a readable generated-result width.",
);
assert.match(
  styles,
  /\.school-selection-card-fields\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\);/,
  "School selection generated-result fields should use shrink-safe columns.",
);
assert.match(
  styles,
  /\.school-selection-major-field\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/,
  "School selection major field should span the result card so admission probability cannot cover it.",
);
assert.match(
  styles,
  /\.school-selection-card-fields label span\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
  "School selection field labels should wrap inside result cards instead of overlapping.",
);
