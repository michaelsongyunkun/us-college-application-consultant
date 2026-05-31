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

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function includesAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function tagsForText(text) {
  return MAJOR_TAGS.filter((group) => includesAny(text, group.terms)).map((group) => group.tag);
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

function courseScore(course, studentProfile, targetGrade) {
  const tagOverlap = course.tags.filter((tag) => studentProfile.majorTags.includes(tag)).length;
  const academicOverlap = course.tags.filter((tag) => studentProfile.academicTags.includes(tag)).length;
  const textOverlap = studentProfile.majorTags.some((tag) => course.tags.includes(tag)) ? 1 : 0;
  const ratingScore = RATING_SCORE[course.rating] || 2;
  const researchBonus = course.tags.includes("humanities_social") || course.keywords.includes("研究能力") ? 0.2 : 0;
  const earlyPenalty = Number(targetGrade) <= 10 && ["AP Research", "AP Calculus BC", "AP Physics C: Electricity and Magnetism"].includes(course.name) ? -0.8 : 0;
  return tagOverlap * 4 + academicOverlap * 1.4 + textOverlap + ratingScore * 0.45 + researchBonus + earlyPenalty;
}

function buildReason(course, studentProfile, targetGrade) {
  const major = studentProfile.majorDirection || "目标专业";
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
  const items = futureGrades.map((grade) => {
    const count = GRADE_COURSE_COUNTS[grade] || 3;
    const sortedCandidates = availableCourses
      .filter((course) => !selectedIds.has(course.id))
      .map((course) => ({
        course,
        score: courseScore(course, studentProfile, grade),
      }))
      .sort((a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name, "en"));

    const priorityPoolSize = Math.min(sortedCandidates.length, Math.max(count * 3, count));
    const recommendations = [
      ...rotate(sortedCandidates.slice(0, priorityPoolSize), batchIndex * count),
      ...sortedCandidates.slice(priorityPoolSize),
    ]
      .slice(0, count)
      .map(({ course }) => {
        selectedIds.add(course.id);
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
          reason: buildReason(course, studentProfile, grade),
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
    notice: `已根据成绩与难点生成 ${futureGrades[0]} 至 12 年级 AP 选课计划。`,
  };
}
