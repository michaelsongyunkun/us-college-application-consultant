import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterSchools,
  parseSchoolsMarkdown,
} from "../src/domain/school-encyclopedia.mjs";

const markdown = readFileSync("data/schools.md", "utf8");
const internationalMarkdown = readFileSync("data/international-schools.md", "utf8");
const otherRegionMarkdown = readFileSync("data/other-region-schools.md", "utf8");
const schools = parseSchoolsMarkdown(markdown);
const internationalSchoolsData = parseSchoolsMarkdown(internationalMarkdown);
const otherRegionSchoolsData = parseSchoolsMarkdown(otherRegionMarkdown);
const universities = schools.filter((school) => school.category === "university");
const liberalArtsColleges = schools.filter((school) => school.category === "liberal-arts");
const internationalSchools = internationalSchoolsData.filter((school) => school.category === "international");
const otherRegionSchools = otherRegionSchoolsData.filter((school) => school.category === "other-region");

assert.equal(schools.length, 118);
assert.equal(universities.length, 65);
assert.equal(liberalArtsColleges.length, 53);
assert.equal(internationalSchools.length, 27);
assert.equal(otherRegionSchools.length, 37);
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
assert.deepEqual(
  {
    category: internationalSchools[0].category,
    categoryLabel: internationalSchools[0].categoryLabel,
    rank: internationalSchools[0].rank,
    name: internationalSchools[0].name,
    region: internationalSchools[0].region,
    website: internationalSchools[0].website,
    budgetRmb: internationalSchools[0].budgetRmb,
    aLevelRequirement: internationalSchools[0].aLevelRequirement,
    apRequirement: internationalSchools[0].apRequirement,
    ibRequirement: internationalSchools[0].ibRequirement,
  },
  {
    category: "international",
    categoryLabel: "英港澳加新院校",
    rank: "1",
    name: "墨尔本大学 University of Melbourne",
    region: "澳洲",
    website: "https://www.unimelb.edu.au",
    budgetRmb: "37-49 万",
    aLevelRequirement:
      "2026入学按课程给保证分/最低分；常见为 Arts/Design/Science BBB，Commerce ABB，Biomedicine AAB，Oral Health AAA；A*=6, A=5, B=4, C=3, D=2, E=1，并需满足英语、数学/科学等先修。",
    apRequirement:
      "需美国高中毕业证与GPA，并提交 SAT / ACT 或 AP aggregate；AP aggregate通常按3-4门AP计分，常见区间约9-18分；单门AP低于3不计入总分，也不能满足先修。",
    ibRequirement:
      "2026入学保证/最低分按课程不同，常见区间约25-37；Arts约30，Science约31，Commerce/Biomedicine约35，Oral Health约37；数学、化学、生物/物理等先修需达到课程页要求。",
  },
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "Waterloo" })[0].name,
  "滑铁卢大学 University of Waterloo",
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "宽口径" })[0].name,
  "墨尔本大学 University of Melbourne",
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "AP aggregate" })[0].name,
  "墨尔本大学 University of Melbourne",
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "National University of Singapore" })[0].region,
  "新加坡",
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "Nanyang Technological University" })[0].categoryLabel,
  "英港澳加新院校",
);
assert.equal(
  filterSchools(internationalSchoolsData, { category: "international", query: "Jurong West" })[0].location,
  "新加坡西部 Jurong West，主校区为大型封闭式校园。",
);
assert.deepEqual(
  {
    category: otherRegionSchools[0].category,
    categoryLabel: otherRegionSchools[0].categoryLabel,
    rank: otherRegionSchools[0].rank,
    name: otherRegionSchools[0].name,
    region: otherRegionSchools[0].region,
    website: otherRegionSchools[0].website,
    qsRanking: otherRegionSchools[0].qsRanking,
    englishRequirement: otherRegionSchools[0].englishRequirement,
  },
  {
    category: "other-region",
    categoryLabel: "其他地区院校",
    rank: "1",
    name: "苏黎世联邦理工学院 ETH Zurich",
    region: "瑞士",
    website: "https://ethz.ch",
    qsRanking: "7",
    englishRequirement:
      "本科大多德语授课，通常需德语 C1；少数后续课程和项目使用英语，英语要求按课程页。",
  },
);
assert.equal(
  filterSchools(otherRegionSchoolsData, { category: "other-region", query: "National University of Singapore" }).length,
  0,
);
assert.equal(
  filterSchools(otherRegionSchoolsData, { category: "other-region", query: "Tsinghua" })[0].region,
  "中国大陆",
);
assert.equal(
  filterSchools(otherRegionSchoolsData, { category: "other-region", query: "中关村" })[0].location,
  "中国北京海淀区，中关村高校与科研机构密集区。",
);
