import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildApCourseStudentProfile,
  parseApCoursesMarkdown,
  recommendApCoursePlan,
} from "../ap-course-recommender.mjs";

const courses = parseApCoursesMarkdown(readFileSync("data/ap-courses.md", "utf8"));

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
