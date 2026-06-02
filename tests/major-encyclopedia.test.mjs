import assert from "node:assert/strict";
import {
  filterMajors,
  matchMajorsFromQuestionnaire,
  parseMajorsMarkdown,
} from "../src/domain/major-encyclopedia.mjs";

const sampleMarkdown = `
# 美国大学本科可申请专业汇总

## 计算机、数据与信息技术

### 001. Computer Science 计算机科学
- 本科开设核验：A. 本科正式专业/学位
- 专业介绍：Computer Science 计算机科学适合喜欢编程、算法、AI、系统和项目实践的学生。
- 常见学习内容：编程、算法、数据结构、系统、数据库、AI、软件工程。
- 就业方向：软件工程师、AI工程师、数据平台、产品技术岗、创业。
- 专业强校：MIT、Stanford、CMU
- 录取难度：极高
- 建议申请检索名/口径：Computer Science undergraduate major。

### 002. Public Policy 公共政策
- 本科开设核验：A. 本科正式专业/学位
- 专业介绍：Public Policy 公共政策适合关注社会议题、政策分析、写作表达和数据证据的学生。
- 常见学习内容：经济学、统计、政策分析、公共管理、研究方法。
- 就业方向：政策分析师、咨询、NGO、政府事务、智库研究。
- 专业强校：Princeton、Duke、Georgetown
- 录取难度：高
- 建议申请检索名/口径：Public Policy undergraduate major。
`;

const majors = parseMajorsMarkdown(sampleMarkdown);

assert.equal(majors.length, 2);
assert.equal(majors[0].id, "major-001-computer-science");
assert.equal(majors[0].category, "计算机、数据与信息技术");
assert.equal(majors[0].englishName, "Computer Science");
assert.equal(majors[0].chineseName, "计算机科学");
assert.equal(majors[0].careerPaths, "软件工程师、AI工程师、数据平台、产品技术岗、创业。");
assert.equal(majors[1].searchName, "Public Policy undergraduate major。");

const csResults = filterMajors(majors, { query: "AI 工程师", category: "计算机、数据与信息技术" });
assert.deepEqual(csResults.map((major) => major.englishName), ["Computer Science"]);

const policyResults = filterMajors(majors, { query: "政策 写作 NGO" });
assert.deepEqual(policyResults.map((major) => major.englishName), ["Public Policy"]);

const matches = matchMajorsFromQuestionnaire(majors, {
  subjects: ["计算机 / 数据", "数学"],
  workStyles: ["编程建模", "产品项目"],
  outputs: ["技术作品"],
  careerKeywords: "AI工程师 数据平台",
  strengths: "喜欢写代码和做机器学习项目",
  avoid: "不想以大量政策写作为主",
});

assert.equal(matches[0].major.englishName, "Computer Science");
assert.ok(matches[0].score > matches[1].score);
assert.ok(matches[0].reasons.some((reason) => reason.includes("AI工程师")));
assert.ok(matches[0].reasons.length <= 4);
