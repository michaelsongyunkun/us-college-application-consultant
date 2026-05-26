import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCompetitionsMarkdown } from "../competition-recommender.mjs";
import { classifyResource, enrichResourceEligibility } from "../resource-eligibility.mjs";

const markdown = readFileSync("data/competitions.md", "utf8");
const competitions = parseCompetitionsMarkdown(markdown);

assert.match(markdown, /# 竞赛汇总（Markdown 清洗版）/);
assert.equal(competitions.length, 527);

const codeQuest = competitions.find((competition) => competition.name === "CodeQuest (Lockheed Martin)");
assert.ok(codeQuest);
assert.match(codeQuest.description, /美国高中生团队编程邀请赛/);

const decision = classifyResource(enrichResourceEligibility(codeQuest), {
  nationality: "中国",
  identityDescription: "无美国公民或永久居民身份",
  schoolContext: "mainland_china_high_school",
});
assert.equal(decision.excluded, true);
assert.deepEqual(decision.reasons, ["仅限美国境内指定高中或地区学生申请"]);
