import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCompetitionStudentProfile,
  parseCompetitionsMarkdown,
  recommendCompetitions,
} from "../src/domain/competition-recommender.mjs";
import {
  buildSummerSchoolStudentProfile,
  parseSummerSchoolsMarkdown,
  recommendSummerSchools,
} from "../src/domain/summer-school-recommender.mjs";

const profile = {
  grade: "10年级",
  majorDirection: "History / Humanities",
  interests: "world history, museum curation, public writing",
  coreStrengths: "history essay, school newspaper editor, debate",
};
const activities = [
  {
    type: "人文研究",
    activityName: "地方历史档案研究",
    executionDescription: "整理口述史材料，撰写历史研究文章",
  },
];
const narrative = "推荐规划方向：历史写作、公共史项目、人文社科研究。";

const competitions = parseCompetitionsMarkdown(readFileSync("data/competitions.md", "utf8"));
const competitionBatch = recommendCompetitions({
  studentProfile: buildCompetitionStudentProfile({ profile, activities, narrative }),
  competitions,
});

assert.equal(competitionBatch.items.length, 5);
assert.ok(competitionBatch.items.every((item) => item.category !== "数学类"));
assert.ok(competitionBatch.items.some((item) => item.category === "人文社科类"));

const summerSchools = parseSummerSchoolsMarkdown(readFileSync("data/summer-schools.md", "utf8"));
const summerSchoolBatch = recommendSummerSchools({
  studentProfile: buildSummerSchoolStudentProfile({ profile, activities, narrative }),
  summerSchools,
});

assert.equal(summerSchoolBatch.items.length, 3);
assert.ok(summerSchoolBatch.items.every((item) => item.category !== "数学方向"));
assert.ok(summerSchoolBatch.items.some((item) => item.category === "人文社科方向"));
