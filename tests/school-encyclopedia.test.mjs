import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterSchools,
  parseSchoolsMarkdown,
} from "../src/domain/school-encyclopedia.mjs";

const markdown = readFileSync("data/schools.md", "utf8");
const schools = parseSchoolsMarkdown(markdown);
const universities = schools.filter((school) => school.category === "university");
const liberalArtsColleges = schools.filter((school) => school.category === "liberal-arts");

assert.equal(schools.length, 118);
assert.equal(universities.length, 65);
assert.equal(liberalArtsColleges.length, 53);
assert.deepEqual(schools[0], {
  id: "university-1-princeton",
  category: "university",
  categoryLabel: "综合大学 T80",
  rank: "1",
  name: "普林斯顿大学 Princeton",
  applicationAndEssays:
    "CommonApp / Coalition / QuestBridge；主文书 650 词；必答 6 篇（约 900 词）：Why Major 250 / Community 250 / Service 250 / 3 道 50 词短问答",
  schoolFeatures:
    "Ivy 中本科教育最纯粹，必做 Senior Thesis；新泽西小镇 + Residential Colleges + Eating Clubs。",
  admissionPreferences:
    "看学术潜力 + 思辨深度 + 服务精神（in service of humanity）；偏沉稳深入、利他的学生。",
  recommendationRequirements:
    "1 升学顾问 + 2 任课老师（建议 1 STEM + 1 人文）；可再加 1 选交 Other Recommender。",
});
assert.equal(filterSchools(schools, { category: "university", query: "Maker" })[0].name, "麻省理工 MIT");
assert.equal(filterSchools(schools, { category: "liberal-arts", query: "Williams" })[0].rank, "1");
