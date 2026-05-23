import assert from "node:assert/strict";
import {
  buildStudentCaseProfile,
  matchAdmissionCases,
  parseAdmissionCasesMarkdown,
} from "../admission-case-matcher.mjs";

const markdown = `
## 案例 1
- 录取：UCLA 加州大学洛杉矶分校
- 专业：计算机数学
- 课程成绩：雅思 8.0、ACT 36、A-Level Mathematics A*、Further Mathematics A*
- 奖项：NEC 团队 Leader、英国化学奥赛金奖、物理碗金奖、SCI 论文、专利
- 活动：创办在线学术期刊、机器人协会、TEDx 活动、机器人公益教学

## 案例 2
- 录取：NYU 纽约大学
- 专业：经济学
- 课程成绩：托福 110、AP Microeconomics 5、AP Calculus BC 5
- 奖项：NEC 区域奖、商赛、经济论文
- 活动：经济社社长、公益募捐、投研项目
`;

const cases = parseAdmissionCasesMarkdown(markdown);

assert.equal(cases.length, 2);
assert.deepEqual(cases[0], {
  id: "case-1",
  admission: "UCLA 加州大学洛杉矶分校",
  major: "计算机数学",
  academics: "雅思 8.0、ACT 36、A-Level Mathematics A*、Further Mathematics A*",
  awards: "NEC 团队 Leader、英国化学奥赛金奖、物理碗金奖、SCI 论文、专利",
  activities: "创办在线学术期刊、机器人协会、TEDx 活动、机器人公益教学",
  sourceTitle: "案例 1",
});

const studentProfile = buildStudentCaseProfile({
  profile: {
    grade: "10年级",
    majorDirection: "计算机 / AI / 数学",
    interests: "人工智能、数学建模、机器人公益",
    coreStrengths: "Python，自学微积分，准备物理碗和科研论文",
    existingActivities: "机器人社团、AI 教育公益项目",
    targetSchools: "UC 系、Top 30",
  },
  activities: [
    {
      type: "学术突破",
      activityName: "AI 教育公益研究",
      executionDescription: "开发 Python 工具，服务社区学生，后续形成论文",
      suggestedGrade: "10-11",
    },
  ],
  narrative:
    "背景短板：科研产出和竞赛结果还需要补强。推荐规划方向：AI 公益项目、物理碗、论文产出。",
});

const matches = matchAdmissionCases({
  studentProfile,
  cases,
  limit: 2,
});

assert.equal(matches.length, 1);
assert.equal(matches[0].case.admission, "UCLA 加州大学洛杉矶分校");
assert.ok(matches[0].matchReason.includes("计算机/AI/数学"));
assert.ok(matches[0].takeaway.includes("科研"));

const humanitiesStudentProfile = buildStudentCaseProfile({
  profile: {
    grade: "11",
    majorDirection: "communication / media / social science",
    interests: "writing, debate, community research",
    coreStrengths: "school newspaper, debate, public service",
    existingActivities: "media club and social issue project",
  },
  activities: [],
  narrative: "Target direction is humanities and social science.",
});

const crossMajorMatches = matchAdmissionCases({
  studentProfile: humanitiesStudentProfile,
  cases,
  limit: 2,
});

assert.deepEqual(crossMajorMatches, []);

const humanitiesWithMathInterestProfile = buildStudentCaseProfile({
  profile: {
    grade: "11",
    majorDirection: "communication / media",
    interests: "math, economics, social science",
  },
  activities: [],
  narrative: "",
});

const majorFirstMatches = matchAdmissionCases({
  studentProfile: humanitiesWithMathInterestProfile,
  cases,
  limit: 2,
});

assert.deepEqual(majorFirstMatches, []);

const emptyMatches = matchAdmissionCases({
  studentProfile,
  cases: [],
});

assert.deepEqual(emptyMatches, []);
