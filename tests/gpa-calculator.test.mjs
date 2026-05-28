import assert from "node:assert/strict";
import {
  calculateGpa,
  convertPercentageToGradePoint,
  normalizeGradeThresholds,
} from "../src/domain/gpa-calculator.mjs";

assert.deepEqual(normalizeGradeThresholds({}), { a: 90, b: 80, c: 70, d: 60 });
assert.deepEqual(
  normalizeGradeThresholds({ a: "93", b: "85", c: "", d: "65" }),
  { a: 93, b: 85, c: 70, d: 65 },
);

assert.equal(convertPercentageToGradePoint(95, { a: 90, b: 80, c: 70, d: 60 }), 4);
assert.equal(convertPercentageToGradePoint(90, { a: 90, b: 80, c: 70, d: 60 }), 4);
assert.equal(convertPercentageToGradePoint(89, { a: 90, b: 80, c: 70, d: 60 }), 3.9);
assert.equal(convertPercentageToGradePoint(86, { a: 90, b: 80, c: 70, d: 60 }), 3.6);
assert.equal(convertPercentageToGradePoint(80, { a: 90, b: 80, c: 70, d: 60 }), 3);
assert.equal(convertPercentageToGradePoint(72, { a: 90, b: 80, c: 70, d: 60 }), 2.2);
assert.equal(convertPercentageToGradePoint(71, { a: 90, b: 80, c: 70, d: 60 }), 2.1);
assert.equal(convertPercentageToGradePoint(61, { a: 90, b: 80, c: 70, d: 60 }), 1.1);
assert.equal(convertPercentageToGradePoint(59, { a: 90, b: 80, c: 70, d: 60 }), 0);
assert.equal(convertPercentageToGradePoint(95, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 5);
assert.equal(convertPercentageToGradePoint(90, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 5);
assert.equal(convertPercentageToGradePoint(89, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 4.9);
assert.equal(convertPercentageToGradePoint(86, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 4.6);
assert.equal(convertPercentageToGradePoint(80, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 4);
assert.equal(convertPercentageToGradePoint(72, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 3.2);
assert.equal(convertPercentageToGradePoint(61, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 2.1);
assert.equal(convertPercentageToGradePoint(59, { a: 90, b: 80, c: 70, d: 60 }, { isAp: true }), 0);

const percentageResult = calculateGpa({
  scale: "percentage",
  thresholds: { a: 90, b: 80, c: 70, d: 60 },
  courses: [
    { name: "English", grade: "95", credits: "4" },
    { name: "AP History", grade: "82", credits: "2", isAp: true },
    { name: "Biology", grade: "74", credits: "" },
  ],
});

assert.equal(percentageResult.validCourseCount, 3);
assert.equal(percentageResult.totalCredits, 7);
assert.equal(percentageResult.gpa, 3.83);
assert.deepEqual(
  percentageResult.courses.map((course) => course.gradePoint),
  [4, 4.2, 2.4],
);

const fourPointResult = calculateGpa({
  scale: "four-point",
  courses: [
    { name: "AP Calculus", grade: "5.0", credits: "5", isAp: true },
    { name: "Physics", grade: "3.3", credits: "3" },
    { name: "Art", grade: "3.7", credits: "" },
  ],
});

assert.equal(fourPointResult.totalCredits, 9);
assert.equal(fourPointResult.gpa, 4.29);
assert.deepEqual(fourPointResult.errors, []);
assert.equal(fourPointResult.courses[0].isAp, true);

const invalidResult = calculateGpa({
  scale: "four-point",
  courses: [
    { name: "Invalid", grade: "4.2", credits: "1" },
    { name: "Missing", grade: "", credits: "2" },
  ],
});

assert.equal(invalidResult.gpa, null);
assert.equal(invalidResult.validCourseCount, 0);
assert.equal(invalidResult.errors.length, 2);
