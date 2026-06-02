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

function courseNamesForGrade(apPlan, grade) {
  return apPlan.items.find((item) => item.grade === String(grade))?.recommendations.map((course) => course.name) || [];
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

assertGradeIncludes(engineeringRigorPlan, "11", ["AP Calculus BC", "AP Physics C: Mechanics"]);
