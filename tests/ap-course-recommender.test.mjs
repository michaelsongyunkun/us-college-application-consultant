import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildApCourseStudentProfile,
  parseApCoursesMarkdown,
  recommendApCoursePlan,
} from "../src/domain/ap-course-recommender.mjs";

const courses = parseApCoursesMarkdown(readFileSync("data/ap-courses.md", "utf8"));
const courseLookup = new Map(courses.map((course) => [course.name, course]));

const SCIENCE_COURSE_TERMS = [
  "calculus",
  "precalculus",
  "statistics",
  "computer science",
  "biology",
  "chemistry",
  "physics",
  "environmental science",
];
const LIBERAL_COURSE_TERMS = [
  "african american studies",
  "art",
  "economics",
  "english",
  "government",
  "history",
  "human geography",
  "language and culture",
  "latin",
  "literature",
  "music",
  "psychology",
  "research",
  "seminar",
];

function courseNameHasTerm(course, terms) {
  const name = String(course.name || "").toLowerCase();
  return terms.some((term) => name.includes(term));
}

function withCatalogCourse(course) {
  return courseLookup.get(course.name) || course;
}

function isScienceCourse(course) {
  return courseNameHasTerm(withCatalogCourse(course), SCIENCE_COURSE_TERMS);
}

function isLiberalCourse(course) {
  return courseNameHasTerm(withCatalogCourse(course), LIBERAL_COURSE_TERMS);
}

function flatPlanEntries(apPlan) {
  return apPlan.items.flatMap((item) =>
    item.recommendations.map((course) => ({
      grade: Number(item.grade),
      course: withCatalogCourse(course),
    })),
  );
}

function assertCourseNotAfter(entries, earlierCourseName, laterCourseName) {
  const earlier = entries.find((entry) => entry.course.name === earlierCourseName);
  const later = entries.find((entry) => entry.course.name === laterCourseName);
  if (!earlier || !later) return;
  assert.ok(
    earlier.grade <= later.grade,
    `${earlierCourseName} should not be recommended after ${laterCourseName}`,
  );
}

const CALCULUS_CHAIN_COURSES = ["AP Precalculus", "AP Calculus AB", "AP Calculus BC"];

function gradeForCourse(apPlan, courseName) {
  return flatPlanEntries(apPlan).find((entry) => entry.course.name === courseName)?.grade;
}

function assertCalculusTimingRules(apPlan) {
  const precalculusGrade = gradeForCourse(apPlan, "AP Precalculus");
  if (precalculusGrade) {
    assert.ok(
      precalculusGrade >= 9 && precalculusGrade <= 10,
      `AP Precalculus should be recommended in 9-10 grade only; got ${precalculusGrade}`,
    );
  }

  const calculusAbGrade = gradeForCourse(apPlan, "AP Calculus AB");
  if (calculusAbGrade) {
    assert.ok(
      calculusAbGrade >= 10 && calculusAbGrade <= 11,
      `AP Calculus AB should be recommended in 10-11 grade only; got ${calculusAbGrade}`,
    );
  }

  for (const gradePlan of apPlan.items) {
    const calculusCourses = gradePlan.recommendations
      .map((course) => course.name)
      .filter((courseName) => CALCULUS_CHAIN_COURSES.includes(courseName));
    assert.ok(
      calculusCourses.length <= 1,
      `${gradePlan.grade} grade should not contain more than one calculus-chain course; got ${calculusCourses.join(", ")}`,
    );
  }
}

function courseNamesForGrade(apPlan, grade) {
  return apPlan.items.find((item) => item.grade === String(grade))?.recommendations.map((course) => course.name) || [];
}

function courseNames(apPlan) {
  return flatPlanEntries(apPlan).map((entry) => entry.course.name);
}

function recommendedCourse(apPlan, courseName) {
  return apPlan.items.flatMap((item) => item.recommendations).find((course) => course.name === courseName);
}

function assertPlanIncludes(apPlan, expectedCourseNames) {
  const names = courseNames(apPlan);
  for (const courseName of expectedCourseNames) {
    assert.ok(names.includes(courseName), `Plan should include ${courseName}; got ${names.join(", ")}`);
  }
}

function assertPlanIncludesAny(apPlan, expectedCourseNames, message) {
  const names = courseNames(apPlan);
  assert.ok(
    expectedCourseNames.some((courseName) => names.includes(courseName)),
    `${message}; got ${names.join(", ")}`,
  );
}

function assertPlanExcludes(apPlan, excludedCourseNames) {
  const names = courseNames(apPlan);
  for (const courseName of excludedCourseNames) {
    assert.ok(!names.includes(courseName), `Plan should not include ${courseName}; got ${names.join(", ")}`);
  }
}

function assertRecommendationFields(apPlan) {
  const recommendations = apPlan.items.flatMap((item) => item.recommendations);
  assert.ok(recommendations.length > 0, "Plan should produce recommendations.");
  for (const course of recommendations) {
    assert.ok(["专业核心", "专业支撑", "文理补强", "课程链前置", "兴趣拓展"].includes(course.fitType), `${course.name} should include a fitType.`);
    assert.ok(["理科量化", "文科社科", "跨学科"].includes(course.studySide), `${course.name} should include a studySide.`);
    assert.equal(typeof course.fitScore, "number", `${course.name} should include numeric fitScore.`);
    assert.ok(course.reason && !course.reason.includes("匹配专业"), `${course.name} should include a specific reason.`);
    assert.ok(course.balanceReason, `${course.name} should explain its文理 balance role.`);
  }
}

function assertGradeIncludes(apPlan, grade, expectedCourseNames) {
  const courseNames = courseNamesForGrade(apPlan, grade);
  for (const courseName of expectedCourseNames) {
    assert.ok(courseNames.includes(courseName), `${grade} grade should include ${courseName}; got ${courseNames.join(", ")}`);
  }
}

assert.ok(courses.length >= 38);
assert.ok(courses.some((course) => course.name === "AP Calculus BC"));
assert.ok(courses.some((course) => course.name === "AP Computer Science A"));
assert.ok(courses.find((course) => course.name === "AP Calculus BC").fiveRate);
assert.ok(courses.find((course) => course.name === "AP Calculus BC").fourRate);
assert.ok(courses.find((course) => course.name === "AP Calculus BC").fiveThreshold);
assert.ok(courses.find((course) => course.name === "AP Calculus BC").fourThreshold);

const studentProfile = buildApCourseStudentProfile({
  grade: "9年级",
  majorDirection: "计算机 / AI / 数据科学",
  completedCourses: ["AP Computer Science Principles", "AP Precalculus"],
  academicStatus: "数学稳定，写作需要加强",
});

const plan = recommendApCoursePlan({
  studentProfile,
  courses,
});

assert.equal(plan.items.length, 3);
assert.deepEqual(
  plan.items.map((item) => item.grade),
  ["10", "11", "12"],
);
assert.deepEqual(
  plan.items.map((item) => item.recommendations.length),
  [3, 4, 3],
);
assert.ok(
  plan.items
    .flatMap((item) => item.recommendations)
    .every((course) => course.name !== "AP Computer Science Principles" && course.name !== "AP Precalculus"),
);
assert.ok(plan.items.flatMap((item) => item.recommendations).some((course) => course.name.includes("Computer Science")));
assert.ok(plan.items.flatMap((item) => item.recommendations).every((course) => "fiveRate" in course));
assert.ok(plan.items.flatMap((item) => item.recommendations).every((course) => "fourRate" in course));
assert.ok(plan.items.flatMap((item) => item.recommendations).every((course) => "fiveThreshold" in course));
assert.ok(plan.items.flatMap((item) => item.recommendations).every((course) => "fourThreshold" in course));
assert.ok(plan.notice.includes("成绩与难点"));
for (const gradePlan of plan.items) {
  assert.ok(gradePlan.recommendations.some(isScienceCourse), `${gradePlan.grade} grade should keep science/AP technical coverage`);
  assert.ok(gradePlan.recommendations.some(isLiberalCourse), `${gradePlan.grade} grade should include humanities/social/language/arts coverage`);
}
assertCourseNotAfter(flatPlanEntries(plan), "AP Calculus AB", "AP Calculus BC");
assertCourseNotAfter(flatPlanEntries(plan), "AP Physics C: Mechanics", "AP Physics C: Electricity and Magnetism");

const refreshedPlan = recommendApCoursePlan({
  studentProfile,
  courses,
  batchIndex: 1,
});

assert.notDeepEqual(
  refreshedPlan.items.flatMap((item) => item.recommendations).map((course) => course.id),
  plan.items.flatMap((item) => item.recommendations).map((course) => course.id),
);

const incomplete = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "9年级",
    majorDirection: "计算机",
    completedCourses: [],
  }),
  courses,
});

assert.deepEqual(incomplete.items, []);
assert.ok(incomplete.notice.includes("至少选择一门"));

const noApProfile = buildApCourseStudentProfile({
  grade: "9年级",
  majorDirection: "计算机",
  completedCourses: [],
  hasNoApCourses: true,
});

const noApPlan = recommendApCoursePlan({
  studentProfile: noApProfile,
  courses,
});

assert.equal(noApPlan.items.length, 3);
assert.deepEqual(
  noApPlan.items.map((item) => item.recommendations.length),
  [3, 4, 3],
);

const sequenceFixtureCourses = [
  { id: "fixture-calc-bc", name: "AP Calculus BC", rating: "S", tags: ["math"], keywords: [] },
  { id: "fixture-calc-ab", name: "AP Calculus AB", rating: "B", tags: ["math"], keywords: [] },
  { id: "fixture-physics-em", name: "AP Physics C: Electricity and Magnetism", rating: "S", tags: ["engineering"], keywords: [] },
  { id: "fixture-physics-mech", name: "AP Physics C: Mechanics", rating: "B", tags: ["engineering"], keywords: [] },
  { id: "fixture-english-lit", name: "AP English Literature and Composition", rating: "A+", tags: ["language"], keywords: [] },
  { id: "fixture-english-lang", name: "AP English Language and Composition", rating: "B", tags: ["language"], keywords: [] },
  { id: "fixture-csa", name: "AP Computer Science A", rating: "A", tags: ["cs"], keywords: [] },
  { id: "fixture-csp", name: "AP Computer Science Principles", rating: "B", tags: ["cs"], keywords: [] },
  { id: "fixture-biology", name: "AP Biology", rating: "A", tags: ["bio_med"], keywords: [] },
  { id: "fixture-history", name: "AP United States History", rating: "B", tags: ["humanities_social"], keywords: [] },
];

const sequencePlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "9",
    majorDirection: "Computer Science and Engineering",
    completedCourses: [],
    hasNoApCourses: true,
  }),
  courses: sequenceFixtureCourses,
});
const sequenceEntries = flatPlanEntries(sequencePlan);

assertCourseNotAfter(sequenceEntries, "AP Calculus AB", "AP Calculus BC");
assertCourseNotAfter(sequenceEntries, "AP Physics C: Mechanics", "AP Physics C: Electricity and Magnetism");
assertCourseNotAfter(sequenceEntries, "AP English Language and Composition", "AP English Literature and Composition");
assertCourseNotAfter(sequenceEntries, "AP Computer Science Principles", "AP Computer Science A");

const lateCsRigorPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "11",
    majorDirection: "Computer Science / AI / Data Science",
    completedCourses: ["AP Precalculus"],
  }),
  courses,
});

assertGradeIncludes(lateCsRigorPlan, "12", ["AP Calculus BC", "AP Computer Science A", "AP Statistics"]);
assert.match(lateCsRigorPlan.notice, /11.*12|12.*11/, "Rigor notice should explicitly name the 11th-to-12th grade deadline.");

const engineeringRigorPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "10",
    majorDirection: "Engineering / Physics",
    completedCourses: ["AP Precalculus", "AP Physics 1"],
  }),
  courses,
});

assertGradeIncludes(engineeringRigorPlan, "11", ["AP Calculus AB", "AP Physics C: Mechanics"]);
assert.ok(
  !gradeForCourse(engineeringRigorPlan, "AP Calculus BC") || gradeForCourse(engineeringRigorPlan, "AP Calculus BC") === 12,
  "Engineering students starting in 10th grade should not place BC before the 12th-grade slot when AB is still needed.",
);

const earlyMathSequencePlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "8年级",
    majorDirection: "Mathematics / Statistics / Quantitative Finance",
    completedCourses: [],
    hasNoApCourses: true,
  }),
  courses,
});

assertCalculusTimingRules(earlyMathSequencePlan);
assert.ok(
  gradeForCourse(earlyMathSequencePlan, "AP Precalculus") || gradeForCourse(earlyMathSequencePlan, "AP Calculus AB"),
  "Early-start math plans should include a reasonable Precalculus or Calculus AB entry point.",
);
assert.notEqual(
  gradeForCourse(earlyMathSequencePlan, "AP Calculus AB"),
  9,
  "Calculus AB should not be scheduled before 10th grade.",
);
if (gradeForCourse(earlyMathSequencePlan, "AP Calculus BC")) {
  assert.ok(
    gradeForCourse(earlyMathSequencePlan, "AP Calculus AB"),
    "Early-start students should not jump from Precalculus directly to Calculus BC without the AB step.",
  );
  assertCourseNotAfter(flatPlanEntries(earlyMathSequencePlan), "AP Calculus AB", "AP Calculus BC");
}

const lateMathSequencePlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "10年级",
    majorDirection: "Mathematics / Statistics",
    completedCourses: ["AP Precalculus"],
  }),
  courses,
});

assertCalculusTimingRules(lateMathSequencePlan);
assert.notDeepEqual(
  courseNamesForGrade(lateMathSequencePlan, "11").filter((courseName) => CALCULUS_CHAIN_COURSES.includes(courseName)).sort(),
  ["AP Calculus AB", "AP Calculus BC"],
  "11th grade should not recommend both Calculus AB and Calculus BC in the same year.",
);

const csBalancedPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "9年级",
    majorDirection: "Computer Science / AI / Data Science",
    completedCourses: ["AP Computer Science Principles", "AP Precalculus"],
    academicStatus: "算法项目较强，但英文论证写作和公开表达需要补强。",
  }),
  courses,
});

assertPlanIncludes(csBalancedPlan, ["AP Calculus BC", "AP Computer Science A", "AP Statistics"]);
assertPlanIncludesAny(
  csBalancedPlan,
  ["AP English Language and Composition", "AP US Government and Politics", "AP Psychology", "AP Seminar", "AP Research"],
  "CS route should include writing/social science/research breadth instead of only math/CS courses",
);
assert.equal(recommendedCourse(csBalancedPlan, "AP Computer Science A")?.fitType, "专业核心");
assert.match(
  recommendedCourse(csBalancedPlan, "AP Computer Science A")?.reason || "",
  /算法|编程|计算机|数据/,
  "CSA reason should name the concrete CS signal it strengthens.",
);
assert.ok(
  csBalancedPlan.items.some((item) => item.balanceSummary && /写作|社科|研究|表达|文科/.test(item.balanceSummary)),
  "CS grade plans should explain the humanities/social-science balance move.",
);
assertRecommendationFields(csBalancedPlan);

const engineeringFocusedPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "10年级",
    majorDirection: "Engineering / Mechanical / Robotics",
    completedCourses: ["AP Precalculus", "AP Physics 1"],
    academicStatus: "数学和物理成绩稳定，希望体现工程建模与实验能力。",
  }),
  courses,
});

assertPlanIncludes(engineeringFocusedPlan, [
  "AP Calculus BC",
  "AP Physics C: Mechanics",
  "AP Chemistry",
]);
assertPlanExcludes(engineeringFocusedPlan, [
  "AP 2-D Art and Design",
  "AP 3-D Art and Design",
  "AP Drawing",
  "AP Music Theory",
]);
assert.equal(recommendedCourse(engineeringFocusedPlan, "AP Physics C: Mechanics")?.fitType, "专业核心");
assert.match(
  recommendedCourse(engineeringFocusedPlan, "AP Chemistry")?.reason || "",
  /工程|实验|材料|化学|支撑/,
  "Chemistry should be framed as engineering support, not a generic course.",
);
assertRecommendationFields(engineeringFocusedPlan);

const businessBalancedPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "10年级",
    majorDirection: "Business / Economics / Finance",
    completedCourses: [],
    hasNoApCourses: true,
    academicStatus: "对商业分析、市场和金融感兴趣，写作表达也需要保留。",
  }),
  courses,
});

assertPlanIncludes(businessBalancedPlan, [
  "AP Microeconomics",
  "AP Macroeconomics",
  "AP Statistics",
]);
assertPlanIncludesAny(
  businessBalancedPlan,
  ["AP Calculus AB", "AP Calculus BC", "AP Precalculus"],
  "Business/economics route should include an appropriate quantitative math chain.",
);
assertPlanIncludesAny(
  businessBalancedPlan,
  ["AP English Language and Composition", "AP US Government and Politics", "AP Psychology", "AP Seminar"],
  "Business/economics route should preserve writing/social-science expression.",
);
assert.match(
  recommendedCourse(businessBalancedPlan, "AP Statistics")?.reason || "",
  /数据|统计|商业|经济|金融/,
  "Statistics should explain the business analytics signal.",
);
assertRecommendationFields(businessBalancedPlan);

const humanitiesBalancedPlan = recommendApCoursePlan({
  studentProfile: buildApCourseStudentProfile({
    grade: "10年级",
    majorDirection: "History / Political Science / Public Policy / Law",
    completedCourses: [],
    hasNoApCourses: true,
    academicStatus: "阅读写作较强，希望保留政策研究和数据分析能力。",
  }),
  courses,
});

assertPlanIncludesAny(
  humanitiesBalancedPlan,
  ["AP English Language and Composition", "AP English Literature and Composition"],
  "Humanities/social science route should include English writing or literature.",
);
assertPlanIncludesAny(
  humanitiesBalancedPlan,
  ["AP United States History", "AP World History: Modern", "AP European History"],
  "Humanities/social science route should include history.",
);
assertPlanIncludesAny(
  humanitiesBalancedPlan,
  ["AP US Government and Politics", "AP Comparative Government and Politics"],
  "Humanities/social science route should include government/politics.",
);
assertPlanIncludesAny(
  humanitiesBalancedPlan,
  ["AP Research", "AP Seminar"],
  "Humanities/social science route should include research or seminar.",
);
assertPlanIncludesAny(
  humanitiesBalancedPlan,
  ["AP Statistics", "AP Psychology", "AP Environmental Science"],
  "Humanities/social science route should retain reasonable quantitative/science breadth.",
);
assertRecommendationFields(humanitiesBalancedPlan);
