import assert from "node:assert/strict";
import {
  buildCompetitionStudentProfile,
  parseCompetitionsMarkdown,
  rateCompetition,
  recommendCompetitions,
} from "../competition-recommender.mjs";

const markdown = `
# 数学类（Mathematics）
- **评级：S**｜[AMC 10 / 12 · AIME](https://maa.org/maa-invitational-competitions)
- **评级：C**｜Alpha Math Contest — 官网以承办机构最新公告为准
# 计算机类（Computer Science）
- **评级：A**｜[USACO Bronze / Silver / Gold / Platinum](http://usaco.org)
- **评级：B**｜[ACSL American Computer Science League](https://www.acsl.org)
# 经济商科类（Economics & Business）
- **评级：A**｜[NEC National Economics Challenge](https://www.councilforeconed.org/nec)
- **评级：A**｜[Wharton Global High School Investment Competition](https://globalyouth.wharton.upenn.edu)
# 科创类（STEM Research & Innovation）
- **评级：S**｜[ISEF](https://www.societyforscience.org/isef)
- **评级：A**｜[Conrad Challenge](https://www.conradchallenge.org)
# 人文社科类（Humanities & Social Sciences）
- **评级：A**｜[John Locke Essay Competition](https://www.johnlockeinstitute.com/essay-competition)
- **评级：B**｜Plain Humanities Contest — 官网以承办机构最新公告为准
`;

const competitions = parseCompetitionsMarkdown(markdown);

assert.equal(competitions.length, 10);
assert.deepEqual(competitions[0], {
  id: "competition-1",
  name: "AMC 10 / 12 · AIME",
  url: "https://maa.org/maa-invitational-competitions",
  category: "数学类",
  categoryRaw: "数学类（Mathematics）",
  rating: "S",
  raw: "- **评级：S**｜[AMC 10 / 12 · AIME](https://maa.org/maa-invitational-competitions)",
});
assert.equal(competitions[1].url, "");
assert.equal(rateCompetition({ name: "丘成桐中学科学奖（数学方向）", category: "数学类", raw: "" }), "S");
assert.equal(rateCompetition({ name: "ISEF（物理与天文学科组）", category: "科创类", raw: "" }), "S");
assert.equal(rateCompetition({ name: "AMC 8 / 10 / 12 · AIME", category: "数学类", raw: "" }), "A");
assert.equal(rateCompetition({ name: "AMC 8 / 10 / 12", category: "数学类", raw: "" }), "B");
assert.equal(rateCompetition({ name: "Math Kangaroo 国际袋鼠数学竞赛", category: "数学类", raw: "" }), "C");
assert.equal(rateCompetition({ name: "HMMT 哈佛-MIT 数学锦标赛", category: "数学类", raw: "" }), "A");
assert.equal(rateCompetition({ name: "PUMaC 普林斯顿数学竞赛", category: "数学类", raw: "" }), "A");
assert.equal(rateCompetition({ name: "BMT 伯克利数学锦标赛", category: "数学类", raw: "" }), "A");
assert.equal(rateCompetition({ name: "UKMT SMC / IMC / JMC / Kangaroo / Olympiad", category: "数学类", raw: "" }), "A");
assert.equal(rateCompetition({ name: "HKIMO 香港国际数学奥林匹克", category: "数学类", raw: "" }), "A");

const studentProfile = buildCompetitionStudentProfile({
  profile: {
    grade: "10年级",
    majorDirection: "计算机 / AI / 数学",
    interests: "算法、机器人、公益",
    coreStrengths: "Python、数学建模、准备 AIME",
  },
  activities: [
    {
      type: "学术突破",
      activityName: "AI 教育公益项目",
      executionDescription: "使用 Python 建模，后续希望做科研展示",
    },
  ],
  narrative: "推荐规划方向：算法竞赛、数学竞赛、科创项目。",
});

const firstBatch = recommendCompetitions({
  studentProfile,
  competitions,
  previousBatchIds: [],
});

assert.equal(firstBatch.items.length, 5);
assert.equal(firstBatch.items.filter((item) => item.recommendationType === "学科强相关").length, 3);
assert.equal(firstBatch.items.filter((item) => item.recommendationType === "拓展型").length, 2);
assert.ok(firstBatch.items.some((item) => item.name.includes("USACO")));
assert.ok(firstBatch.items.some((item) => item.url === "官网待确认"));

const secondBatch = recommendCompetitions({
  studentProfile,
  competitions,
  previousBatchIds: firstBatch.items.map((item) => item.id),
});

assert.equal(secondBatch.items.length, 5);
assert.notDeepEqual(
  secondBatch.items.map((item) => item.id),
  firstBatch.items.map((item) => item.id),
);

const emptyStudentProfile = buildCompetitionStudentProfile({
  profile: {},
  activities: [],
  narrative: "",
});

const emptyBatch = recommendCompetitions({
  studentProfile: emptyStudentProfile,
  competitions,
});

assert.equal(emptyStudentProfile.hasAnyInput, false);
assert.deepEqual(emptyBatch.items, []);
assert.ok(emptyBatch.notice.includes("填写用户背景"));

const historyStudentProfile = buildCompetitionStudentProfile({
  profile: {
    grade: "10年级",
    majorDirection: "历史 / 人文社科",
    interests: "世界史、博物馆策展、公共写作",
    coreStrengths: "历史论文、校刊编辑、辩论",
  },
  activities: [
    {
      type: "人文研究",
      activityName: "地方历史档案研究",
      executionDescription: "整理口述史材料，撰写历史研究文章",
    },
  ],
  narrative: "推荐规划方向：历史写作、公共史项目、人文社科研究。",
});

const historyBatch = recommendCompetitions({
  studentProfile: historyStudentProfile,
  competitions,
});

assert.ok(historyBatch.items.length >= 3);
assert.ok(historyBatch.items.every((item) => item.category !== "数学类"));
assert.ok(historyBatch.items.some((item) => item.category === "人文社科类"));
