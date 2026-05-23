import assert from "node:assert/strict";
import {
  buildSummerSchoolStudentProfile,
  parseSummerSchoolsMarkdown,
  recommendSummerSchools,
  normalizeRating,
  tierForRating,
} from "../summer-school-recommender.mjs";

const markdown = `
# 📐 一、数学方向
## 1. Ross Mathematics Program
- **形式 & 官网**：线下(Ohio Dominican University)
  官网：[rossprogram.org](https://rossprogram.org)
- **简介**：
  世界级数学研究项目。
- **含金量**：S
- **录取率**：约 8%–12%
- **申请要求**：
  - 年龄：15–18 岁
  - Problem Set
- **举办时间**：6 月中旬 – 7 月底
- **申请时间**：3 月 15 日截止
## 2. MathILy
- **形式 & 官网**：线下
  官网：[mathily.org](https://mathily.org)
- **简介**：证明训练项目。
- **含金量**：A
- **录取率**：约 20%–30%
- **申请要求**：
  - 高中生
- **举办时间**：7 月 – 8 月
- **申请时间**：3 月截止
## 3. Brown Pre-College – Mathematics
- **形式 & 官网**：线下 + 线上
  官网：[precollege.brown.edu](https://precollege.brown.edu)
- **简介**：大学先修课程。
- **含金量**：B
- **录取率**：约 40%–50%
- **申请要求**：
  - 9–12 年级
- **举办时间**：6 – 8 月
- **申请时间**：5 月初滚动
# 🤖 七、AI 计算机科学方向
## 4. MIT BWSI
- **形式 & 官网**：线上 + 线下
  官网：[bwsi.mit.edu](https://bwsi.mit.edu)
- **简介**：AI 与自动驾驶工程项目。
- **含金量**：A+(身份受限)
- **录取率**：约 10%–15%
- **申请要求**：
  - Python 基础
- **举办时间**：7 月
- **申请时间**：3 月截止
## 5. Stanford AI4ALL
- **形式 & 官网**：线下
  官网：[ai-4-all.org](https://ai-4-all.org)
- **简介**：AI 公益与伦理项目。
- **含金量**：B+
- **录取率**：约 20%–30%
- **申请要求**：
  - 9–11 年级
- **举办时间**：7 月
- **申请时间**：2 月截止
## 6. Coding Pre-College
- **形式 & 官网**：线上
- **简介**：编程体验课程。
- **含金量**：C+
- **录取率**：约 50%–60%
- **申请要求**：
  - 高中生
- **举办时间**：8 月
- **申请时间**：滚动
# 📚 五、人文社科方向
## 7. Telluride Association Summer Seminar
- **形式 & 官网**：线下
  官网：[tellurideassociation.org](https://tellurideassociation.org)
- **简介**：人文社科主题研讨项目。
- **含金量**：S
- **录取率**：约 5%–10%
- **申请要求**：
  - 写作样本
- **举办时间**：6 月 – 7 月
- **申请时间**：1 月截止
## 8. Yale Young Global Scholars – Literature, Philosophy & Culture
- **形式 & 官网**：线下
  官网：[globalscholars.yale.edu](https://globalscholars.yale.edu)
- **简介**：文学、哲学与文化研究。
- **含金量**：A
- **录取率**：约 25%–35%
- **申请要求**：
  - 文书
- **举办时间**：7 月
- **申请时间**：1 月截止
## 9. Brown Pre-College – History
- **形式 & 官网**：线下 + 线上
  官网：[precollege.brown.edu](https://precollege.brown.edu)
- **简介**：历史与公共写作课程。
- **含金量**：B
- **录取率**：约 40%–50%
- **申请要求**：
  - 9–12 年级
- **举办时间**：6 – 8 月
- **申请时间**：5 月滚动
`;

assert.equal(normalizeRating("A+(身份受限)"), "A+");
assert.equal(tierForRating("A+"), "冲刺型");
assert.equal(tierForRating("B+"), "匹配型");
assert.equal(tierForRating("C+"), "保底型");

const summerSchools = parseSummerSchoolsMarkdown(markdown);

assert.equal(summerSchools.length, 9);
assert.deepEqual(summerSchools[0], {
  id: "summer-school-1",
  name: "Ross Mathematics Program",
  category: "数学方向",
  formatAndWebsite: "线下(Ohio Dominican University) 官网：rossprogram.org (https://rossprogram.org)",
  description: "世界级数学研究项目。",
  rating: "S",
  rawRating: "S",
  tier: "冲刺型",
  admissionRate: "约 8%–12%",
  requirements: ["年龄：15–18 岁", "Problem Set"],
  programTime: "6 月中旬 – 7 月底",
  applicationTime: "3 月 15 日截止",
});

const studentProfile = buildSummerSchoolStudentProfile({
  profile: {
    grade: "10年级",
    majorDirection: "计算机 / AI / 数学",
    interests: "人工智能、数学建模、机器人公益",
    coreStrengths: "Python、AIME、科研论文准备",
  },
  activities: [
    {
      type: "学术突破",
      activityName: "AI 教育公益项目",
      executionDescription: "用 Python 建模并服务社区学生",
    },
  ],
  narrative: "推荐规划方向：AI 公益项目、数学竞赛、科研产出。",
});

const firstBatch = recommendSummerSchools({
  studentProfile,
  summerSchools,
});

assert.equal(firstBatch.items.length, 3);
assert.deepEqual(
  firstBatch.items.map((item) => item.tier),
  ["冲刺型", "匹配型", "保底型"],
);
assert.ok(firstBatch.items.some((item) => item.name === "MIT BWSI"));
assert.ok(firstBatch.items.every((item) => item.reason.includes("当前学生")));

const secondBatch = recommendSummerSchools({
  studentProfile,
  summerSchools,
  seenIds: firstBatch.items.map((item) => item.id),
  previousBatchIds: firstBatch.items.map((item) => item.id),
});

assert.equal(secondBatch.items.length, 3);
assert.notDeepEqual(
  secondBatch.items.map((item) => item.id),
  firstBatch.items.map((item) => item.id),
);

const historyStudentProfile = buildSummerSchoolStudentProfile({
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

const historyBatch = recommendSummerSchools({
  studentProfile: historyStudentProfile,
  summerSchools,
});

assert.equal(historyBatch.items.length, 3);
assert.ok(historyBatch.items.every((item) => item.category === "人文社科方向"));
