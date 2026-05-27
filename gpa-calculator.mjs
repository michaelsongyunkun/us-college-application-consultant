const DEFAULT_THRESHOLDS = Object.freeze({ a: 90, b: 80, c: 70, d: 60 });

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeGradeThresholds(thresholds = {}) {
  return {
    a: parseNumber(thresholds.a) ?? DEFAULT_THRESHOLDS.a,
    b: parseNumber(thresholds.b) ?? DEFAULT_THRESHOLDS.b,
    c: parseNumber(thresholds.c) ?? DEFAULT_THRESHOLDS.c,
    d: parseNumber(thresholds.d) ?? DEFAULT_THRESHOLDS.d,
  };
}

function roundGradePoint(value) {
  return Number(value.toFixed(2));
}

function convertBandPercentageToGradePoint(percentage, lowerThreshold, upperThreshold, basePoint) {
  if (upperThreshold <= lowerThreshold) return basePoint;
  const bandProgress = (percentage - lowerThreshold) / (upperThreshold - lowerThreshold);
  return roundGradePoint(basePoint + Math.min(Math.max(bandProgress, 0), 0.99));
}

export function convertPercentageToGradePoint(grade, thresholds = DEFAULT_THRESHOLDS, { isAp = false } = {}) {
  const percentage = parseNumber(grade);
  if (percentage === null || percentage < 0 || percentage > 100) return null;
  const normalizedThresholds = normalizeGradeThresholds(thresholds);
  const apBonus = isAp ? 1 : 0;
  if (percentage >= normalizedThresholds.a) return 4 + apBonus;
  if (percentage >= normalizedThresholds.b) {
    return convertBandPercentageToGradePoint(percentage, normalizedThresholds.b, normalizedThresholds.a, 3) + apBonus;
  }
  if (percentage >= normalizedThresholds.c) {
    return convertBandPercentageToGradePoint(percentage, normalizedThresholds.c, normalizedThresholds.b, 2) + apBonus;
  }
  if (percentage >= normalizedThresholds.d) {
    return convertBandPercentageToGradePoint(percentage, normalizedThresholds.d, normalizedThresholds.c, 1) + apBonus;
  }
  return 0;
}

function normalizeCredit(value) {
  const credit = parseNumber(value);
  return credit === null ? 1 : credit;
}

function normalizeCourseGrade({ scale, grade, thresholds, isAp }) {
  if (scale === "percentage") return convertPercentageToGradePoint(grade, thresholds, { isAp });
  const gradePoint = parseNumber(grade);
  const maxGradePoint = isAp ? 5 : 4;
  if (gradePoint === null || gradePoint < 0 || gradePoint > maxGradePoint) return null;
  return gradePoint;
}

export function calculateGpa({ scale = "percentage", courses = [], thresholds = {} } = {}) {
  const normalizedThresholds = normalizeGradeThresholds(thresholds);
  const errors = [];
  const normalizedCourses = [];
  let totalWeightedPoints = 0;
  let totalCredits = 0;

  courses.forEach((course, index) => {
    const gradePoint = normalizeCourseGrade({
      scale,
      grade: course.grade,
      thresholds: normalizedThresholds,
      isAp: Boolean(course.isAp),
    });
    const credits = normalizeCredit(course.credits);
    const label = course.name?.trim() || `第 ${index + 1} 科`;

    if (gradePoint === null) {
      errors.push(`${label} 的成绩无效`);
      return;
    }
    if (credits <= 0) {
      errors.push(`${label} 的学分必须大于 0`);
      return;
    }

    totalWeightedPoints += gradePoint * credits;
    totalCredits += credits;
    normalizedCourses.push({
      name: label,
      originalGrade: course.grade,
      credits,
      gradePoint,
      isAp: Boolean(course.isAp),
    });
  });

  return {
    scale,
    thresholds: normalizedThresholds,
    courses: normalizedCourses,
    errors,
    validCourseCount: normalizedCourses.length,
    totalCredits,
    gpa: totalCredits > 0 ? Number((totalWeightedPoints / totalCredits).toFixed(2)) : null,
  };
}
