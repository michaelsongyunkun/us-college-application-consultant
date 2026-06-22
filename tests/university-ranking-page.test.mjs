import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync("university-ranking.html", "utf8");
const script = readFileSync("src/client/university-ranking.js", "utf8");
const domain = readFileSync("src/domain/university-ranking.mjs", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const commandNavigation = indexHtml.match(/<nav class="command-sidebar-nav"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(html, /<title>大学排名<\/title>/);
assert.match(html, /class="[^"]*university-ranking-shell[^"]*"/);
assert.ok(html.includes('href="./university-ranking.html" data-safe-nav aria-current="page"'));
assert.ok(html.includes('src="./data/university-ranking-data.js?v=20260622-university-ranking"'));
assert.ok(html.includes('src="./src/client/university-ranking.js?v=20260622-ranking-remove-header"'));
assert.ok(html.includes('id="rankingWeightForm"'));
assert.ok(html.includes('id="rankingDatasetTabs"'));
assert.ok(html.includes('id="rankingTableBody"'));
assert.ok(html.includes('id="exportRankingSvgButton"'));
assert.ok(!html.includes("brand-page-header"));
assert.ok(!html.includes("rankingDatasetEyebrow"));
assert.ok(!html.includes("rankingSourceLabel"));
assert.ok(!html.includes("rankingGeneratedAt"));

assert.ok(
  commandNavigation.indexOf("resource-library.html") < commandNavigation.indexOf("school-encyclopedia.html")
    && commandNavigation.indexOf("school-encyclopedia.html") < commandNavigation.indexOf("university-ranking.html")
    && commandNavigation.indexOf("university-ranking.html") < commandNavigation.indexOf("major-encyclopedia.html")
    && commandNavigation.indexOf("major-encyclopedia.html") < commandNavigation.indexOf("course-helper.html"),
  "Command navigation should place university ranking in the reference section between schools and majors.",
);

assert.ok(script.includes("window.UNIVERSITY_RANKING_DATA"));
assert.ok(script.includes("collegeCompass.universityRanking.savedRankings.v1"));
assert.ok(script.includes("buildRanking"));
assert.ok(script.includes("buildHomeDataset"));
assert.ok(script.includes('class="resource-tab ranking-tab${selected ? " is-active" : ""}"'));
assert.ok(!script.includes("rankingSourceLabel"));
assert.ok(!script.includes("rankingGeneratedAt"));
assert.ok(!script.includes("rankingDatasetEyebrow"));
assert.ok(!script.includes("Source: ${dataset.sourceLabel}"));
assert.ok(!script.includes("Generated: ${new Date(data.generatedAt)"));
assert.ok(!script.includes("/api/deepseek"));
assert.ok(!script.includes("deepSeekRag"));
assert.ok(!script.includes("assistantProfile"));
assert.ok(!domain.includes("deepseek"));
assert.ok(!domain.includes("Rag"));
assert.ok(!domain.includes("/api/"));
