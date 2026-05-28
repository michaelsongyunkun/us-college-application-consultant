import assert from "node:assert/strict";
import {
  buildStudentCaseProfile,
  matchAdmissionCases,
  parseAdmissionCasesMarkdown,
} from "../src/domain/admission-case-matcher.mjs";

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

const englishCoverageCases = parseAdmissionCasesMarkdown(`
## 案例 1
- 录取：Dartmouth / UCLA / UCB
- 专业：生物
- 课程成绩：AP Biology 5, AP Chemistry 5
- 奖项：HOSA, iGEM research, biology fair
- 活动：hospital volunteering, lab research

## 案例 2
- 录取：Emory University
- 专业：公共卫生
- 课程成绩：AP Statistics 5, AP Biology 5
- 奖项：public health research paper
- 活动：community health education project

## 案例 3
- 录取：Stanford / Yale / Princeton
- 专业：Political Science / Religious Studies
- 课程成绩：AP US Government 5, AP World History 5
- 奖项：debate, Model United Nations, public policy essay
- 活动：campaign volunteering and civic education

## 案例 4
- 录取：Washington University in St. Louis
- 专业：Communication
- 课程成绩：AP English Language 5
- 奖项：journalism award, speech competition
- 活动：school newspaper and media project
`);

const englishBiologyProfile = buildStudentCaseProfile({
  profile: {
    grade: "10th grade",
    majorDirection: "biology / biomedical science / pre-med",
    interests: "lab research, HOSA, public health education",
    coreStrengths: "biology fair and hospital volunteering",
  },
  activities: [],
  narrative: "The student wants biology and medicine-adjacent activities.",
});

const englishBiologyMatches = matchAdmissionCases({
  studentProfile: englishBiologyProfile,
  cases: englishCoverageCases,
  limit: englishCoverageCases.length,
});

assert.ok(
  englishBiologyMatches.length >= 2,
  "English biology/medical profiles should produce enough case matches for the refresh button.",
);
assert.match(englishBiologyMatches[0].case.major, /生物|公共卫生/);

const englishPoliticsProfile = buildStudentCaseProfile({
  profile: {
    grade: "11th grade",
    majorDirection: "political science / international relations / public policy",
    interests: "debate, Model United Nations, civic education",
    coreStrengths: "public speaking and policy research",
  },
  activities: [],
  narrative: "The student is building a public policy and civic engagement direction.",
});

const englishPoliticsMatches = matchAdmissionCases({
  studentProfile: englishPoliticsProfile,
  cases: englishCoverageCases,
  limit: englishCoverageCases.length,
});

assert.ok(
  englishPoliticsMatches.length >= 2,
  "English social science profiles should produce enough case matches for the refresh button.",
);
assert.match(englishPoliticsMatches[0].case.major, /Political Science|Communication/);

const emptyMatches = matchAdmissionCases({
  studentProfile,
  cases: [],
});

assert.deepEqual(emptyMatches, []);
