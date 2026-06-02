const GRADE_COURSE_COUNTS = {
  "9": 2,
  "10": 3,
  "11": 4,
  "12": 3,
};

const RATING_SCORE = {
  S: 5,
  "A+": 4.5,
  A: 4,
  "B+": 3,
  B: 2,
  C: 1,
};

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

const STUDY_SIDE_TAGS = {
  science: new Set(["cs", "math", "engineering", "bio_med"]),
  liberal: new Set(["humanities_social", "arts", "language", "business_econ"]),
};

const MAJOR_COURSE_TERMS = {
  cs: ["computer science"],
  math: ["calculus", "precalculus", "statistics"],
  engineering: ["calculus", "physics", "chemistry"],
  bio_med: ["biology", "chemistry", "psychology"],
  business_econ: ["economics", "statistics", "calculus"],
  humanities_social: ["government", "history", "human geography", "psychology"],
  arts: ["art", "drawing", "music"],
  language: ["english", "language", "latin", "literature"],
};

const MAJOR_RIGOR_COURSES = {
  cs: ["AP Calculus BC", "AP Computer Science A", "AP Statistics"],
  math: ["AP Calculus BC", "AP Statistics"],
  engineering: [
    "AP Calculus BC",
    "AP Physics C: Mechanics",
    "AP Physics C: Electricity and Magnetism",
    "AP Chemistry",
  ],
  bio_med: ["AP Biology", "AP Chemistry", "AP Statistics", "AP Psychology"],
  business_econ: ["AP Calculus BC", "AP Statistics", "AP Microeconomics", "AP Macroeconomics"],
  humanities_social: [
    "AP English Literature and Composition",
    "AP United States Government and Politics",
    "AP United States History",
    "AP Research",
  ],
  arts: ["AP 2-D Art and Design", "AP 3-D Art and Design", "AP Drawing", "AP Art History"],
  language: ["AP English Literature and Composition", "AP English Language and Composition", "AP Research"],
};

const AP_COURSE_SEQUENCES = [
  ["AP Precalculus", "AP Calculus AB", "AP Calculus BC"],
  ["AP Computer Science Principles", "AP Computer Science A"],
  ["AP Physics 1", "AP Physics 2"],
  ["AP Physics 1", "AP Physics C: Mechanics", "AP Physics C: Electricity and Magnetism"],
  ["AP English Language and Composition", "AP English Literature and Composition"],
  ["AP Seminar", "AP Research"],
  ["AP Spanish Language and Culture", "AP Spanish Literature and Culture"],
];

const MAJOR_TAGS = [
  { tag: "cs", terms: ["计算机", "人工智能", "ai", "cs", "编程", "算法", "数据", "软件"] },
  { tag: "math", terms: ["数学", "统计", "精算", "量化", "数据", "math", "statistics"] },
  { tag: "engineering", terms: ["工程", "物理", "机械", "电子", "机器人", "航空", "材料"] },
  { tag: "bio_med", terms: ["生物", "医学", "医疗", "公共卫生", "神经", "心理", "健康"] },
  { tag: "business_econ", terms: ["经济", "商科", "金融", "商业", "管理", "会计", "创业"] },
  { tag: "humanities_social", terms: ["历史", "政治", "社会", "法律", "公共政策", "传媒", "新闻", "教育", "人文", "社科"] },
  { tag: "arts", terms: ["艺术", "设计", "建筑", "音乐", "视觉", "电影", "戏剧"] },
  { tag: "language", terms: ["语言", "文学", "翻译", "国际关系", "文化", "英语", "写作"] },
];

const ENGLISH_MAJOR_TAGS = [
  { tag: "cs", terms: ["computer science", "software", "programming", "algorithm", "data science"] },
  { tag: "engineering", terms: ["engineering", "physics", "mechanical", "electrical", "robotics", "aerospace", "materials"] },
  { tag: "bio_med", terms: ["biology", "biomedical", "medicine", "medical", "public health", "neuroscience", "psychology", "health"] },
  { tag: "business_econ", terms: ["economics", "business", "finance", "management", "accounting", "entrepreneurship"] },
  { tag: "humanities_social", terms: ["history", "political science", "politics", "social science", "law", "public policy", "media", "journalism", "education", "humanities", "sociology"] },
  { tag: "arts", terms: ["art", "design", "architecture", "music", "visual", "film", "theater"] },
  { tag: "language", terms: ["literature", "translation", "international relations", "culture", "english", "writing"] },
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesTerm(normalizedText, term) {
  const normalizedTerm = term.toLowerCase();
  if (/^[a-z0-9]{1,2}$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`).test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

function includesAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => includesTerm(normalized, term));
}

function tagsForText(text) {
  return unique(
    [...MAJOR_TAGS, ...ENGLISH_MAJOR_TAGS].filter((group) => includesAny(text, group.terms)).map((group) => group.tag),
  );
}

function normalizeCourseName(value) {
  return normalizeText(value)
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/[:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(block, fieldName) {
  const pattern = new RegExp(`- \\*\\*${fieldName}\\*\\*[：:]\\s*([\\s\\S]*?)(?=\\n- \\*\\*|\\n### |$)`);
  return block.match(pattern)?.[1]?.trim() || "";
}

function normalizeRating(value) {
  return String(value || "").match(/S|A\+|A|B\+|B|C/i)?.[0]?.toUpperCase() || "B";
}

export function parseApCoursesMarkdown(markdown) {
  const text = String(markdown || "").trim();
  if (!text) return [];

  return text
    .split(/(?=^###\s+AP\s+)/m)
    .map((block) => block.trim())
    .filter((block) => /^###\s+AP\s+/m.test(block))
    .map((block, index) => {
      const title = block.match(/^###\s+(.+)$/m)?.[1]?.trim() || `AP Course ${index + 1}`;
      const englishName = extractField(block, "英文名称") || title.replace(/（.*?）/g, "").trim();
      const chineseName = extractField(block, "中文名称");
      const category = extractField(block, "课程大类");
      const description = extractField(block, "课程简介");
      const rating = normalizeRating(extractField(block, "含金量评级"));
      const fiveRate = extractField(block, "5 分率");
      const fourRate = extractField(block, "4 分率");
      const fiveThreshold = extractField(block, "5 分阈值");
      const fourThreshold = extractField(block, "4 分阈值");
      const applicationPosition = extractField(block, "申请定位标注");
      const directions = extractField(block, "适配方向");
      const keywords = [...block.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
      const searchText = [englishName, chineseName, category, description, applicationPosition, directions, keywords.join(" ")].join(" ");

      return {
        id: `ap-course-${index + 1}`,
        name: englishName,
        chineseName,
        category,
        description,
        rating,
        fiveRate,
        fourRate,
        fiveThreshold,
        fourThreshold,
        applicationPosition,
        directions,
        keywords,
        tags: unique([...tagsForText(searchText), ...keywords.flatMap(tagsForText)]),
        raw: block,
      };
    });
}

export function buildApCourseStudentProfile({
  grade,
  majorDirection,
  completedCourses,
  hasNoApCourses = false,
  academicStatus = "",
}) {
  const currentGrade = String(grade || "").match(/\d+/)?.[0] || "";
  return {
    currentGrade,
    majorDirection: String(majorDirection || "").trim(),
    majorTags: tagsForText(majorDirection),
    academicStatus: String(academicStatus || "").trim(),
    academicTags: tagsForText(academicStatus),
    completedCourseNames: (completedCourses || []).map(normalizeCourseName),
    hasEnoughInfo: Boolean(currentGrade && String(majorDirection || "").trim() && (completedCourses?.length || hasNoApCourses)),
  };
}

function targetGradesAfter(currentGrade) {
  const current = Number(currentGrade);
  if (!current || current >= 12) return [];
  return [9, 10, 11, 12].filter((grade) => grade > current).map(String);
}

function courseIsCompleted(course, completedCourseNames) {
  const courseName = normalizeCourseName(course.name);
  return completedCourseNames.some((completed) => courseName === completed || courseName.includes(completed) || completed.includes(courseName));
}

function hasPlannedCourseName(plannedCourseNames, courseName) {
  const normalizedCourseName = normalizeCourseName(courseName);
  return [...plannedCourseNames].some(
    (plannedName) =>
      plannedName === normalizedCourseName ||
      plannedName.includes(normalizedCourseName) ||
      normalizedCourseName.includes(plannedName),
  );
}

function catalogHasCourse(courses, courseName) {
  const normalizedCourseName = normalizeCourseName(courseName);
  return courses.some((course) => {
    const candidateName = normalizeCourseName(course.name);
    return (
      candidateName === normalizedCourseName ||
      candidateName.includes(normalizedCourseName) ||
      normalizedCourseName.includes(candidateName)
    );
  });
}

function sequenceIndexForCourse(sequence, course) {
  const courseName = normalizeCourseName(course.name);
  return sequence.findIndex((sequenceCourseName) => normalizeCourseName(sequenceCourseName) === courseName);
}

function prerequisiteNamesForCourse(course) {
  return unique(
    AP_COURSE_SEQUENCES.flatMap((sequence) => {
      const index = sequenceIndexForCourse(sequence, course);
      return index > 0 ? [sequence[index - 1]] : [];
    }),
  );
}

function courseWouldMoveBackward(course, plannedCourseNames) {
  return AP_COURSE_SEQUENCES.some((sequence) => {
    const index = sequenceIndexForCourse(sequence, course);
    if (index < 0) return false;
    return sequence.slice(index + 1).some((harderCourseName) => hasPlannedCourseName(plannedCourseNames, harderCourseName));
  });
}

function courseHasSatisfiedSequence(course, plannedCourseNames, courses) {
  if (courseWouldMoveBackward(course, plannedCourseNames)) return false;
  return prerequisiteNamesForCourse(course).every((prerequisiteName) => {
    if (hasPlannedCourseName(plannedCourseNames, prerequisiteName)) return true;
    return !catalogHasCourse(courses, prerequisiteName);
  });
}

function courseHasSatisfiedSequenceForPlanning(course, plannedCourseNames, courses, { allowLateRigor = false } = {}) {
  if (courseWouldMoveBackward(course, plannedCourseNames)) return false;
  const missingPrerequisites = prerequisiteNamesForCourse(course).filter((prerequisiteName) => {
    if (hasPlannedCourseName(plannedCourseNames, prerequisiteName)) return false;
    return catalogHasCourse(courses, prerequisiteName);
  });
  return !missingPrerequisites.length || allowLateRigor;
}

function courseNameIncludesAny(course, terms) {
  const name = normalizeCourseName(course.name);
  return terms.some((term) => name.includes(term));
}

function courseStudySides(course) {
  const sides = new Set();
  if (courseNameIncludesAny(course, SCIENCE_COURSE_TERMS)) sides.add("science");
  if (courseNameIncludesAny(course, LIBERAL_COURSE_TERMS)) sides.add("liberal");
  if (sides.size) return sides;

  const tags = course.tags || [];
  for (const [side, sideTags] of Object.entries(STUDY_SIDE_TAGS)) {
    if (tags.some((tag) => sideTags.has(tag))) sides.add(side);
  }
  return sides;
}

function courseHasStudySide(course, side) {
  return courseStudySides(course).has(side);
}

function directMajorCourseBonus(course, studentProfile) {
  const courseName = normalizeCourseName(course.name);
  return studentProfile.majorTags.reduce((bonus, tag) => {
    const terms = MAJOR_COURSE_TERMS[tag] || [];
    return bonus + (terms.some((term) => courseName.includes(term)) ? 1.2 : 0);
  }, 0);
}

function findBalanceReplacementIndex(selectedCandidates, requiredSide, lockedCourseIds = new Set()) {
  const otherSide = requiredSide === "science" ? "liberal" : "science";
  const otherSideCount = selectedCandidates.filter(({ course }) => courseHasStudySide(course, otherSide)).length;

  for (let index = selectedCandidates.length - 1; index >= 0; index -= 1) {
    const course = selectedCandidates[index].course;
    if (lockedCourseIds.has(course.id)) continue;
    if (!courseHasStudySide(course, "science") && !courseHasStudySide(course, "liberal")) return index;
  }

  for (let index = selectedCandidates.length - 1; index >= 0; index -= 1) {
    const course = selectedCandidates[index].course;
    if (lockedCourseIds.has(course.id)) continue;
    if (courseHasStudySide(course, requiredSide)) continue;
    if (!courseHasStudySide(course, otherSide) || otherSideCount > 1) return index;
  }

  return -1;
}

function ensureStudyBalance(selectedCandidates, prioritizedCandidates, count, lockedCourseIds = new Set()) {
  if (count < 2) return selectedCandidates;
  const balancedCandidates = [...selectedCandidates];

  for (const side of ["science", "liberal"]) {
    if (balancedCandidates.some(({ course }) => courseHasStudySide(course, side))) continue;
    const balancingCandidate = prioritizedCandidates.find(
      ({ course }) =>
        courseHasStudySide(course, side) &&
        !balancedCandidates.some(({ course: selectedCourse }) => selectedCourse.id === course.id),
    );
    if (!balancingCandidate) continue;

    const replacementIndex = findBalanceReplacementIndex(balancedCandidates, side, lockedCourseIds);
    if (replacementIndex >= 0) {
      balancedCandidates[replacementIndex] = balancingCandidate;
    } else if (balancedCandidates.length < count) {
      balancedCandidates.push(balancingCandidate);
    }
  }

  return balancedCandidates.slice(0, count);
}

function courseMatchesConfiguredName(course, courseName) {
  return normalizeCourseName(course.name) === normalizeCourseName(courseName);
}

function selectCoursesForGrade(sortedCandidates, count, batchIndex, requiredCourseNames = []) {
  const priorityPoolSize = Math.min(sortedCandidates.length, Math.max(count * 3, count));
  const prioritizedCandidates = [
    ...rotate(sortedCandidates.slice(0, priorityPoolSize), batchIndex * count),
    ...sortedCandidates.slice(priorityPoolSize),
  ];
  const requiredCandidates = [];
  for (const courseName of requiredCourseNames) {
    const requiredCandidate = prioritizedCandidates.find(
      ({ course }) =>
        courseMatchesConfiguredName(course, courseName) &&
        !requiredCandidates.some(({ course: selectedCourse }) => selectedCourse.id === course.id),
    );
    if (requiredCandidate) requiredCandidates.push(requiredCandidate);
  }

  const lockedCourseIds = new Set(requiredCandidates.map(({ course }) => course.id));
  const selectedCandidates = [
    ...requiredCandidates,
    ...prioritizedCandidates.filter(({ course }) => !lockedCourseIds.has(course.id)),
  ].slice(0, count);

  return ensureStudyBalance(selectedCandidates, prioritizedCandidates, count, lockedCourseIds);
}

function courseScore(course, studentProfile, targetGrade) {
  const tagOverlap = course.tags.filter((tag) => studentProfile.majorTags.includes(tag)).length;
  const academicOverlap = course.tags.filter((tag) => studentProfile.academicTags.includes(tag)).length;
  const textOverlap = studentProfile.majorTags.some((tag) => course.tags.includes(tag)) ? 1 : 0;
  const ratingScore = RATING_SCORE[course.rating] || 2;
  const researchBonus = course.tags.includes("humanities_social") || course.keywords.includes("研究能力") ? 0.2 : 0;
  const earlyPenalty = Number(targetGrade) <= 10 && ["AP Research", "AP Calculus BC", "AP Physics C: Electricity and Magnetism"].includes(course.name) ? -0.8 : 0;
  return tagOverlap * 4 + academicOverlap * 1.4 + textOverlap + directMajorCourseBonus(course, studentProfile) + ratingScore * 0.45 + researchBonus + earlyPenalty;
}

function majorRigorCourseNames(studentProfile) {
  return unique(studentProfile.majorTags.flatMap((tag) => MAJOR_RIGOR_COURSES[tag] || []));
}

function majorRigorDeadlineGrade(currentGrade) {
  const current = Number(currentGrade);
  if (!current || current >= 12) return "";
  return current >= 11 ? "12" : "11";
}

function isRequiredRigorCourse(course, requiredCourseNames) {
  return requiredCourseNames.some((courseName) => courseMatchesConfiguredName(course, courseName));
}

function buildReason(course, studentProfile, targetGrade, { isMajorRigor = false } = {}) {
  const major = studentProfile.majorDirection || "目标专业";
  if (isMajorRigor) {
    return `${course.name} 是 ${major} 方向的高阶 AP 信号，建议在 11 年级开始完成；如果当前进度已经较晚，也要最晚放在 12 年级补完。`;
  }
  const matched = course.tags.filter((tag) => studentProfile.majorTags.includes(tag));
  const academicMatched = course.tags.filter((tag) => studentProfile.academicTags.includes(tag));
  if (matched.length) {
    const academicText = academicMatched.length ? "，同时回应当前成绩与难点中体现出的相关能力需求" : "";
    return `${course.name} 与 ${major} 的课程能力要求匹配${academicText}，适合放在 ${targetGrade} 年级强化专业相关学术信号。`;
  }
  return `${course.name} 可补充 ${targetGrade} 年级的课程广度，帮助学生在主线课程之外保留跨学科能力证明。`;
}

function rotate(items, offset) {
  if (!items.length) return [];
  const safeOffset = offset % items.length;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
}

export function recommendApCoursePlan({ studentProfile, courses, batchIndex = 0 }) {
  const normalizedCourses = courses || [];
  if (!studentProfile?.hasEnoughInfo || !normalizedCourses.length) {
    return {
      items: [],
      notice: "请先填写当前年级、目标专业方向，并至少选择一门已修读的 AP 课程或“无修读任何 AP 课程”，再生成明年至 12 年级的 AP 选课计划。",
    };
  }

  const futureGrades = targetGradesAfter(studentProfile.currentGrade);
  if (!futureGrades.length) {
    return {
      items: [],
      notice: "当前年级已到 12 年级或年级信息无法继续规划，建议结合申请季时间单独判断是否补充 AP 考试。",
    };
  }

  const availableCourses = normalizedCourses.filter((course) => !courseIsCompleted(course, studentProfile.completedCourseNames));
  const selectedIds = new Set();
  const plannedCourseNames = new Set(studentProfile.completedCourseNames);
  const rigorCourseNames = majorRigorCourseNames(studentProfile);
  const rigorDeadlineGrade = majorRigorDeadlineGrade(studentProfile.currentGrade);
  const items = futureGrades.map((grade) => {
    const count = GRADE_COURSE_COUNTS[grade] || 3;
    const requiredCourseNames = grade === rigorDeadlineGrade ? rigorCourseNames : [];
    const sortedCandidates = availableCourses
      .filter(
        (course) =>
          !selectedIds.has(course.id) &&
          courseHasSatisfiedSequenceForPlanning(course, plannedCourseNames, normalizedCourses, {
            allowLateRigor: Number(grade) >= 11 && isRequiredRigorCourse(course, requiredCourseNames),
          }),
      )
      .map((course) => ({
        course,
        score: courseScore(course, studentProfile, grade),
      }))
      .sort((a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name, "en"));

    const recommendations = selectCoursesForGrade(sortedCandidates, count, batchIndex, requiredCourseNames)
      .map(({ course }) => {
        selectedIds.add(course.id);
        plannedCourseNames.add(normalizeCourseName(course.name));
        const isMajorRigor = isRequiredRigorCourse(course, requiredCourseNames);
        return {
          id: course.id,
          name: course.name,
          chineseName: course.chineseName,
          rating: course.rating,
          category: course.category,
          directions: course.directions,
          fiveRate: course.fiveRate,
          fourRate: course.fourRate,
          fiveThreshold: course.fiveThreshold,
          fourThreshold: course.fourThreshold,
          reason: buildReason(course, studentProfile, grade, { isMajorRigor }),
        };
      });

    return {
      grade,
      targetCount: count,
      recommendations,
    };
  });

  return {
    items,
    notice: `已根据成绩与难点、文理均衡和先易后难顺序生成 ${futureGrades[0]} 至 12 年级 AP 选课计划，并优先引导学生在 11 年级、最晚 12 年级完成目标专业最高阶 AP 课程。`,
  };
}
