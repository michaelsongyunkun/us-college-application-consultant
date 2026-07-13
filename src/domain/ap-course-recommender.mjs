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

const FIT_TYPE_SCORE = {
  专业核心: 8,
  专业支撑: 5.5,
  文理补强: 4.4,
  课程链前置: 6.8,
  兴趣拓展: 1.2,
};

const STUDY_SIDE_LABELS = {
  science: "理科量化",
  liberal: "文科社科",
  interdisciplinary: "跨学科",
};

const SCIENCE_COURSE_TERMS = [
  "calculus",
  "precalculus",
  "statistics",
  "computer science",
  "biology",
  "chemistry",
  "economics",
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

const INTERDISCIPLINARY_COURSE_TERMS = [
  "economics",
  "environmental science",
  "human geography",
  "psychology",
  "research",
  "seminar",
  "statistics",
];

const STUDY_SIDE_TAGS = {
  science: new Set(["cs", "math", "engineering", "bio_med"]),
  liberal: new Set(["humanities_social", "arts", "language", "business_econ"]),
};

const MAJOR_COURSE_TERMS = {
  cs: ["computer science", "calculus", "statistics"],
  math: ["calculus", "precalculus", "statistics"],
  engineering: ["calculus", "physics", "chemistry", "environmental science"],
  bio_med: ["biology", "chemistry", "statistics", "psychology"],
  business_econ: ["economics", "statistics", "calculus", "government"],
  humanities_social: ["english", "government", "history", "human geography", "psychology", "research", "seminar"],
  arts: ["art", "drawing", "music", "english", "history"],
  language: ["english", "language", "latin", "literature", "research"],
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
    "AP English Language and Composition",
    "AP US Government and Politics",
    "AP United States History",
    "AP Research",
  ],
  arts: ["AP 2-D Art and Design", "AP 3-D Art and Design", "AP Drawing", "AP Art History"],
  language: ["AP English Literature and Composition", "AP English Language and Composition", "AP Research"],
};

const MAJOR_AP_PROFILES = {
  cs: {
    label: "计算机/AI/数据科学",
    core: {
      "AP Calculus BC": "用高阶微积分证明算法、机器学习和数据建模所需的数学成熟度。",
      "AP Computer Science A": "用 Java 编程、面向对象和算法训练直接支撑计算机专业主线。",
      "AP Statistics": "用数据推断、概率和模型评估补强 AI / 数据科学申请信号。",
    },
    support: {
      "AP Calculus AB": "作为 Calculus BC 前的数学衔接，稳住 STEM 课程链。",
      "AP Computer Science Principles": "适合在 CSA 前建立计算思维、系统和数据表达基础。",
      "AP Research": "可把编程或数据项目沉淀成研究问题、方法和论文型产出。",
    },
    breadth: {
      "AP English Language and Composition": "补强非虚构阅读、技术论证和申请文书表达能力。",
      "AP US Government and Politics": "帮助 CS 学生讨论科技政策、平台治理和公共影响。",
      "AP Psychology": "为人机交互、认知科学和用户研究提供社科视角。",
      "AP Seminar": "训练跨学科提问、证据整合和公开表达，避免 STEM 叙事过窄。",
      "AP Research": "把技术兴趣升级为可展示的独立研究与答辩能力。",
    },
  },
  math: {
    label: "数学/统计/量化",
    core: {
      "AP Calculus BC": "体现高阶数学连续性，是数学、统计和量化方向的核心硬课。",
      "AP Statistics": "展示概率、抽样和推断能力，适合数据分析与统计申请主线。",
      "AP Calculus AB": "作为高阶微积分前置课程，帮助建立严谨的函数与积分基础。",
    },
    support: {
      "AP Computer Science A": "用编程能力支撑建模、数据处理和量化研究。",
      "AP Physics C: Mechanics": "用力学建模强化数学在物理系统中的应用。",
      "AP Microeconomics": "为量化经济和决策模型提供应用场景。",
    },
    breadth: {
      "AP English Language and Composition": "补强证明性写作之外的论证表达和学术沟通。",
      "AP Research": "适合把数学建模或统计问题转化为论文型研究。",
      "AP Psychology": "为统计/数据方向提供行为科学应用场景。",
    },
  },
  engineering: {
    label: "工程/物理/机器人",
    core: {
      "AP Calculus BC": "证明工程建模、控制和高阶物理所需的微积分能力。",
      "AP Physics C: Mechanics": "直接支撑工程力学、机械和机器人方向的物理建模信号。",
      "AP Physics C: Electricity and Magnetism": "强化电子、电气、机器人和硬件方向的电磁学基础。",
    },
    support: {
      "AP Chemistry": "补强材料、化学过程、环境与生物工程中的实验和物质结构理解。",
      "AP Computer Science A": "为机器人、仿真和工程自动化提供编程支撑。",
      "AP Statistics": "支撑实验数据分析、误差判断和工程决策。",
    },
    breadth: {
      "AP English Language and Composition": "帮助工程学生清晰表达设计论证、实验报告和项目影响。",
      "AP Research": "适合把工程设计或实验问题沉淀为研究型成果。",
      "AP US Government and Politics": "可连接工程伦理、科技政策和公共基础设施议题。",
    },
  },
  bio_med: {
    label: "生命科学/医学/健康",
    core: {
      "AP Biology": "直接证明生命系统、遗传、细胞和生态理解，是生物医学主线核心。",
      "AP Chemistry": "支撑分子、反应、实验和医学前置课程的化学基础。",
      "AP Statistics": "补强生物统计、实验设计和医学研究数据解读能力。",
    },
    support: {
      "AP Psychology": "连接神经科学、认知、公共健康和医学人文。",
      "AP Environmental Science": "适合公共卫生、生态健康和环境医学叙事。",
      "AP Research": "可把实验、健康议题或论文项目转化为独立研究信号。",
    },
    breadth: {
      "AP English Language and Composition": "补强医学伦理、科普写作和申请材料表达。",
      "AP US Government and Politics": "连接公共卫生政策、医疗制度和社会影响。",
      "AP Seminar": "训练跨学科证据分析，适合健康议题研究前置。",
    },
  },
  business_econ: {
    label: "商科/经济/金融",
    core: {
      "AP Microeconomics": "直接支撑价格机制、市场结构和商业决策分析。",
      "AP Macroeconomics": "补强宏观政策、金融市场和国际经济理解。",
      "AP Statistics": "用数据分析、抽样和推断能力支撑商业分析与金融判断。",
    },
    support: {
      "AP Calculus BC": "为经济模型、金融数学和量化分析提供高阶数学信号。",
      "AP Calculus AB": "作为经济/金融数学链条的稳健前置。",
      "AP US Government and Politics": "连接政策、监管、市场制度和公共议题。",
    },
    breadth: {
      "AP English Language and Composition": "强化商业写作、案例论证和沟通表达。",
      "AP Psychology": "补充消费者行为、组织行为和市场研究视角。",
      "AP Seminar": "训练商业议题的证据整合、展示和团队协作。",
    },
  },
  humanities_social: {
    label: "人文社科/公共政策/法政",
    core: {
      "AP English Language and Composition": "强化非虚构阅读、政策论证和学术写作，是文社科表达核心。",
      "AP US Government and Politics": "直接支撑政治学、法学预科、公共政策和公民制度理解。",
      "AP United States History": "用史料分析和长期历史叙事支撑人文社科主线。",
    },
    support: {
      "AP English Literature and Composition": "补强文本细读、文学论证和人文分析深度。",
      "AP World History: Modern": "拓展全球史视角，适合国际关系、历史和社会科学。",
      "AP Comparative Government and Politics": "补充比较制度与国际政治分析能力。",
      "AP Research": "把政策、历史或社会议题转化为论文型研究成果。",
    },
    breadth: {
      "AP Statistics": "为公共政策、社会科学研究和量化证据分析补足数据能力。",
      "AP Psychology": "连接社会行为、教育、法律和公共议题。",
      "AP Environmental Science": "适合政策、城市、环境治理等跨学科议题。",
      "AP Seminar": "作为研究和论证表达的前置训练。",
    },
  },
  arts: {
    label: "艺术设计/建筑/传媒艺术",
    core: {
      "AP 2-D Art and Design": "直接服务平面、视觉传达、摄影和数字媒介作品集主线。",
      "AP 3-D Art and Design": "支撑建筑、产品、空间和装置方向的立体表达能力。",
      "AP Drawing": "积累原创视觉语言和手绘表达，适合纯艺、插画和建筑作品集。",
    },
    support: {
      "AP Art History": "补强艺术史论、视觉分析和跨文化理解。",
      "AP Music Theory": "适合音乐、作曲、艺术管理和声音媒介方向。",
      "AP English Language and Composition": "帮助作品集陈述、设计论证和艺术家声明更有说服力。",
    },
    breadth: {
      "AP Statistics": "为设计调研、用户研究和数据可视化补足量化证据。",
      "AP Psychology": "连接用户体验、认知、视觉感知和传播效果。",
      "AP Environmental Science": "适合建筑、可持续设计和公共空间叙事。",
    },
  },
  language: {
    label: "语言文学/写作/文化",
    core: {
      "AP English Literature and Composition": "直接强化文学细读、文本论证和人文写作深度。",
      "AP English Language and Composition": "支撑非虚构阅读、修辞分析和高强度学术表达。",
      "AP Research": "适合把文学、文化或语言议题发展为独立论文成果。",
    },
    support: {
      "AP Seminar": "训练跨文本证据整合、讨论和展示，是 Research 前置。",
      "AP United States History": "补充文化语境与历史叙事材料。",
      "AP Art History": "拓展文化研究、视觉文本和跨文化分析。",
    },
    breadth: {
      "AP Statistics": "补足语言学、传播研究或教育研究中的数据意识。",
      "AP Psychology": "连接认知、语言习得和读者/受众理解。",
      "AP Macroeconomics": "适合国际传播、文化产业或区域研究的社会背景补充。",
    },
  },
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

const CALCULUS_SEQUENCE_COURSES = ["AP Precalculus", "AP Calculus AB", "AP Calculus BC"];

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

function refineMajorTags(tags, majorDirection) {
  const normalized = normalizeText(majorDirection);
  const isEducationTechnology = /education(?:al)? technology|edtech|教育科技|教育技术/u.test(normalized);
  if (isEducationTechnology && tags.includes("cs")) {
    return tags.filter((tag) => tag !== "humanities_social");
  }
  return tags;
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
    majorTags: refineMajorTags(tagsForText(majorDirection), majorDirection),
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

function courseHasSatisfiedSequenceForPlanning(
  course,
  plannedCourseNames,
  courses,
  { allowLateRigor = false, targetGrade = "" } = {},
) {
  if (courseWouldMoveBackward(course, plannedCourseNames)) return false;
  const missingPrerequisites = prerequisiteNamesForCourse(course).filter((prerequisiteName) => {
    if (hasPlannedCourseName(plannedCourseNames, prerequisiteName)) return false;
    if (canWaiveApPrecalculusForCalculusAb(prerequisiteName, course, targetGrade)) return false;
    return catalogHasCourse(courses, prerequisiteName);
  });
  return !missingPrerequisites.length || (allowLateRigor && courseCanUseLateRigorOverride(course));
}

function canWaiveApPrecalculusForCalculusAb(prerequisiteName, course, targetGrade) {
  const grade = Number(targetGrade);
  return (
    courseNameMatchesConfiguredName(prerequisiteName, "AP Precalculus") &&
    courseMatchesConfiguredName(course, "AP Calculus AB") &&
    grade >= 10 &&
    grade <= 11
  );
}

function courseCanUseLateRigorOverride(course) {
  return [
    "AP Calculus BC",
    "AP Computer Science A",
    "AP Physics C: Mechanics",
    "AP Physics C: Electricity and Magnetism",
    "AP Statistics",
  ].some((courseName) => courseMatchesConfiguredName(course, courseName));
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

function courseStudySideLabel(course) {
  const normalizedName = normalizeCourseName(course.name);
  if (INTERDISCIPLINARY_COURSE_TERMS.some((term) => normalizedName.includes(term))) {
    return STUDY_SIDE_LABELS.interdisciplinary;
  }
  const sides = courseStudySides(course);
  if (sides.has("science") && sides.has("liberal")) return STUDY_SIDE_LABELS.interdisciplinary;
  if (sides.has("science")) return STUDY_SIDE_LABELS.science;
  if (sides.has("liberal")) return STUDY_SIDE_LABELS.liberal;
  return STUDY_SIDE_LABELS.interdisciplinary;
}

function profileForTag(tag) {
  return MAJOR_AP_PROFILES[tag];
}

function activeMajorProfiles(studentProfile) {
  const profiles = unique(studentProfile.majorTags).map(profileForTag).filter(Boolean);
  return profiles.length ? profiles : [MAJOR_AP_PROFILES.humanities_social];
}

function configuredCourseFit(course, studentProfile) {
  const normalizedCourseName = normalizeCourseName(course.name);
  const fitTypeOrder = ["专业核心", "专业支撑", "文理补强"];
  let bestFit = null;

  for (const profile of activeMajorProfiles(studentProfile)) {
    const fitCollections = [
      ["专业核心", profile.core],
      ["专业支撑", profile.support],
      ["文理补强", profile.breadth],
    ];
    for (const [fitType, collection] of fitCollections) {
      for (const [courseName, signal] of Object.entries(collection || {})) {
        if (normalizeCourseName(courseName) !== normalizedCourseName) continue;
        const candidate = { fitType, signal, profileLabel: profile.label };
        if (
          !bestFit ||
          fitTypeOrder.indexOf(candidate.fitType) < fitTypeOrder.indexOf(bestFit.fitType)
        ) {
          bestFit = candidate;
        }
      }
    }
  }

  return bestFit;
}

function courseUnlocksProfileCourse(course, studentProfile) {
  const normalizedCourseName = normalizeCourseName(course.name);
  const profileCourseNames = activeMajorProfiles(studentProfile).flatMap((profile) => [
    ...Object.keys(profile.core || {}),
    ...Object.keys(profile.support || {}),
  ]);
  return AP_COURSE_SEQUENCES.some((sequence) => {
    const index = sequence.findIndex((sequenceCourseName) => normalizeCourseName(sequenceCourseName) === normalizedCourseName);
    if (index < 0) return false;
    return sequence
      .slice(index + 1)
      .some((laterCourseName) =>
        profileCourseNames.some((profileCourseName) => normalizeCourseName(profileCourseName) === normalizeCourseName(laterCourseName)),
      );
  });
}

function inferCourseFit(course, studentProfile) {
  const configuredFit = configuredCourseFit(course, studentProfile);
  if (configuredFit?.fitType === "专业核心") return configuredFit;
  if (courseUnlocksProfileCourse(course, studentProfile)) {
    return {
      fitType: "课程链前置",
      signal: `${course.name} 是后续高阶 AP 课程的前置台阶，能让选课路线保持先易后难、逐级加深。${configuredFit?.signal || ""}`,
      profileLabel: configuredFit?.profileLabel || activeMajorProfiles(studentProfile)[0]?.label || "目标专业",
    };
  }
  if (configuredFit) return configuredFit;
  const directBonus = directMajorCourseBonus(course, studentProfile);
  if (directBonus > 0) {
    return {
      fitType: "专业支撑",
      signal: `${course.name} 与目标方向存在学科邻近性，可作为主线课程之外的支撑证据。`,
      profileLabel: activeMajorProfiles(studentProfile)[0]?.label || "目标专业",
    };
  }
  return {
    fitType: "兴趣拓展",
    signal: `${course.name} 可作为兴趣拓展或跨学科补充，但优先级应低于专业核心与合理补强课程。`,
    profileLabel: activeMajorProfiles(studentProfile)[0]?.label || "目标专业",
  };
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
      if (candidateConflictsWithSelectedCalculus(balancedCandidates, balancingCandidate.course, replacementIndex)) continue;
      balancedCandidates[replacementIndex] = balancingCandidate;
    } else if (balancedCandidates.length < count) {
      if (candidateConflictsWithSelectedCalculus(balancedCandidates, balancingCandidate.course)) continue;
      balancedCandidates.push(balancingCandidate);
    }
  }

  return balancedCandidates.slice(0, count);
}

function courseMatchesConfiguredName(course, courseName) {
  return normalizeCourseName(course.name) === normalizeCourseName(courseName);
}

function courseNameMatchesConfiguredName(courseName, configuredCourseName) {
  return normalizeCourseName(courseName) === normalizeCourseName(configuredCourseName);
}

function isCalculusSequenceCourse(course) {
  return CALCULUS_SEQUENCE_COURSES.some((courseName) => courseMatchesConfiguredName(course, courseName));
}

function candidateConflictsWithSelectedCalculus(selectedCandidates, candidateCourse, ignoreIndex = -1) {
  if (!isCalculusSequenceCourse(candidateCourse)) return false;
  return selectedCandidates.some(
    ({ course }, index) => index !== ignoreIndex && isCalculusSequenceCourse(course),
  );
}

function courseAllowedForTargetGrade(course, targetGrade) {
  const grade = Number(targetGrade);
  if (!grade) return true;
  if (courseMatchesConfiguredName(course, "AP Precalculus")) return grade >= 9 && grade <= 10;
  if (courseMatchesConfiguredName(course, "AP Calculus AB")) return grade >= 10 && grade <= 11;
  return true;
}

function configuredCourseAllowedForTargetGrade(courseName, targetGrade) {
  const grade = Number(targetGrade);
  if (!grade) return true;
  if (courseNameMatchesConfiguredName(courseName, "AP Precalculus")) return grade >= 9 && grade <= 10;
  if (courseNameMatchesConfiguredName(courseName, "AP Calculus AB")) return grade >= 10 && grade <= 11;
  return true;
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
    if (
      requiredCandidate &&
      !candidateConflictsWithSelectedCalculus(requiredCandidates, requiredCandidate.course)
    ) {
      requiredCandidates.push(requiredCandidate);
    }
  }

  const lockedCourseIds = new Set(requiredCandidates.map(({ course }) => course.id));
  const selectedCandidates = [...requiredCandidates];
  for (const candidate of prioritizedCandidates) {
    if (selectedCandidates.length >= count) break;
    if (lockedCourseIds.has(candidate.course.id)) continue;
    if (candidateConflictsWithSelectedCalculus(selectedCandidates, candidate.course)) continue;
    selectedCandidates.push(candidate);
  }

  return ensureStudyBalance(selectedCandidates, prioritizedCandidates, count, lockedCourseIds);
}

function foundationGapCourseNames(studentProfile) {
  const status = normalizeText(studentProfile.academicStatus);
  const required = [];
  if (/(?:没有|缺少|缺乏|不足|较弱|薄弱)[^。；，,]{0,12}(?:物理|实验)|(?:物理|实验)[^。；，,]{0,12}(?:没有|缺少|缺乏|不足|较弱|薄弱)/u.test(status)) {
    required.push("AP Physics 1");
  }
  if (/(?:英文|英语|写作|论证)[^。；，,]{0,10}(?:较弱|薄弱|不足|需要加强|待加强)/u.test(status)) {
    required.push("AP English Language and Composition");
  }
  return required;
}

function applyFoundationGapFit(course, fit, isFoundationGap) {
  if (!isFoundationGap) return fit;
  if (courseMatchesConfiguredName(course, "AP Physics 1")) {
    return {
      ...fit,
      fitType: "文理补强",
      signal: "针对已填写的物理实验经历不足，优先用 AP Physics 1 补齐基础概念、实验分析和科学建模经验。",
    };
  }
  if (courseMatchesConfiguredName(course, "AP English Language and Composition")) {
    return {
      ...fit,
      fitType: "文理补强",
      signal: "针对已填写的英文论证写作薄弱项，优先用 AP English Language and Composition 补强阅读、修辞分析和证据表达。",
    };
  }
  return fit;
}

function hasLoadCalibrationNeed(studentProfile) {
  if (Number(studentProfile.currentGrade) < 10) return false;
  const status = normalizeText(studentProfile.academicStatus)
    .replace(/(?:没有|无)(?:明显|任何)?(?:的)?(?:薄弱项?|弱项|短板|不足项?)/gu, "");
  return foundationGapCourseNames({ ...studentProfile, academicStatus: status }).length > 0
    || /缺少|缺乏|不足|较弱|薄弱|需要加强|待加强/u.test(status);
}

function targetCourseCount(studentProfile, grade) {
  const baseline = GRADE_COURSE_COUNTS[grade] || 3;
  return hasLoadCalibrationNeed(studentProfile) ? Math.max(2, baseline - 1) : baseline;
}

function courseScore(course, studentProfile, targetGrade) {
  const fit = inferCourseFit(course, studentProfile);
  const tagOverlap = course.tags.filter((tag) => studentProfile.majorTags.includes(tag)).length;
  const academicOverlap = course.tags.filter((tag) => studentProfile.academicTags.includes(tag)).length;
  const textOverlap = studentProfile.majorTags.some((tag) => course.tags.includes(tag)) ? 1 : 0;
  const ratingScore = RATING_SCORE[course.rating] || 2;
  const researchBonus = course.tags.includes("humanities_social") || course.keywords.includes("研究能力") ? 0.2 : 0;
  const earlyPenalty = Number(targetGrade) <= 10 && ["AP Research", "AP Calculus BC", "AP Physics C: Electricity and Magnetism"].includes(course.name) ? -0.8 : 0;
  const interestPenalty = fit.fitType === "兴趣拓展" ? -2.5 : 0;
  const chainBonus = fit.fitType === "课程链前置" ? 1.2 : 0;
  return (
    (FIT_TYPE_SCORE[fit.fitType] || 0)
    + tagOverlap * 2.8
    + academicOverlap * 1.4
    + textOverlap
    + directMajorCourseBonus(course, studentProfile)
    + ratingScore * 0.45
    + researchBonus
    + chainBonus
    + earlyPenalty
    + interestPenalty
  );
}

function majorRigorCourseNames(studentProfile) {
  const configuredCoreCourses = activeMajorProfiles(studentProfile).flatMap((profile) => Object.keys(profile.core || {}));
  const fallbackCoreCourses = studentProfile.majorTags.flatMap((tag) => MAJOR_RIGOR_COURSES[tag] || []);
  return unique([...configuredCoreCourses, ...fallbackCoreCourses]);
}

function majorRigorDeadlineGrade(currentGrade) {
  const current = Number(currentGrade);
  if (!current || current >= 12) return "";
  return current >= 11 ? "12" : "11";
}

function isRequiredRigorCourse(course, requiredCourseNames) {
  return requiredCourseNames.some((courseName) => courseMatchesConfiguredName(course, courseName));
}

function dominantMajorSide(studentProfile) {
  const tags = new Set(studentProfile.majorTags || []);
  if ([...tags].some((tag) => ["cs", "math", "engineering", "bio_med"].includes(tag))) return "science";
  if ([...tags].some((tag) => ["humanities_social", "arts", "language"].includes(tag))) return "liberal";
  if (tags.has("business_econ")) return "interdisciplinary";
  return "interdisciplinary";
}

function buildReason(course, studentProfile, targetGrade, { fit, isMajorRigor = false } = {}) {
  const courseFit = fit || inferCourseFit(course, studentProfile);
  const timing = isMajorRigor
    ? "这类高价值课程建议在 11 年级开始完成；如果当前进度已经较晚，也要最晚放在 12 年级补完。"
    : `适合放在 ${targetGrade} 年级，形成更连贯的 AP 课程链。`;
  return `${courseFit.signal}${timing}`;
}

function buildBalanceReason(course, studentProfile, fit) {
  const studySide = courseStudySideLabel(course);
  const dominantSide = dominantMajorSide(studentProfile);
  if (fit.fitType === "文理补强") {
    if (dominantSide === "science") {
      return `${studySide}补强：为偏 STEM 的专业主线加入写作、社科或研究表达，帮助申请叙事不只停留在技术能力。`;
    }
    if (dominantSide === "liberal") {
      return `${studySide}补强：为偏文社科/艺术/语言的主线加入数据、科学或研究方法，让论证更有证据感。`;
    }
    return `${studySide}补强：在商业/经济等交叉方向中同时保留量化分析和沟通表达。`;
  }
  if (studySide === STUDY_SIDE_LABELS.science) {
    return "理科量化信号：展示数学、科学、数据或计算能力，是课程强度与方法论的主要支点。";
  }
  if (studySide === STUDY_SIDE_LABELS.liberal) {
    return "文科社科信号：展示阅读、写作、论证或社会议题理解，补足申请中的表达与判断力。";
  }
  return "跨学科信号：连接定量方法、研究表达和现实议题，帮助课程组合服务更完整的申请故事线。";
}

function buildBalanceSummary(recommendations = [], studentProfile) {
  const hasScience = recommendations.some((course) => course.studySide === STUDY_SIDE_LABELS.science || course.studySide === STUDY_SIDE_LABELS.interdisciplinary);
  const hasLiberal = recommendations.some((course) => course.studySide === STUDY_SIDE_LABELS.liberal || course.studySide === STUDY_SIDE_LABELS.interdisciplinary);
  const breadthCourse = recommendations.find((course) => course.fitType === "文理补强");
  if (hasScience && hasLiberal) {
    const coverageText = "当前计划已覆盖数学/科学、写作/社科两个方向。";
    return breadthCourse
      ? `${coverageText}已加入 ${breadthCourse.name} 作为${breadthCourse.studySide}补强。`
      : coverageText;
  }
  if (dominantMajorSide(studentProfile) === "science") {
    return "当前计划偏 STEM，建议后续继续补入写作、社科或研究表达课程。";
  }
  if (dominantMajorSide(studentProfile) === "liberal") {
    return "当前计划偏文社科，建议后续继续补入统计、科学或方法论课程。";
  }
  return "当前计划仍需继续观察文理覆盖，优先选择能服务申请叙事的补强课程。";
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
  const foundationCourseNames = foundationGapCourseNames(studentProfile);
  const rigorDeadlineGrade = majorRigorDeadlineGrade(studentProfile.currentGrade);
  const canUseLateRigorOverride = Number(studentProfile.currentGrade) >= 11;
  const items = futureGrades.map((grade) => {
    const count = targetCourseCount(studentProfile, grade);
    const requiredCourseNames = unique([
      ...(grade === futureGrades[0] ? foundationCourseNames : []),
      ...(grade === rigorDeadlineGrade ? rigorCourseNames : []),
    ]).filter((courseName) => configuredCourseAllowedForTargetGrade(courseName, grade));
    const sortedCandidates = availableCourses
      .filter(
        (course) =>
          !selectedIds.has(course.id) &&
          courseAllowedForTargetGrade(course, grade) &&
          courseHasSatisfiedSequenceForPlanning(course, plannedCourseNames, normalizedCourses, {
            allowLateRigor:
              canUseLateRigorOverride &&
              Number(grade) >= 11 &&
              isRequiredRigorCourse(course, requiredCourseNames),
            targetGrade: grade,
          }),
      )
      .map((course) => ({
        course,
        score: courseScore(course, studentProfile, grade),
      }))
      .sort((a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name, "en"));

    const recommendations = selectCoursesForGrade(sortedCandidates, count, batchIndex, requiredCourseNames)
      .map(({ course, score }) => {
        selectedIds.add(course.id);
        plannedCourseNames.add(normalizeCourseName(course.name));
        const isFoundationGap = isRequiredRigorCourse(course, foundationCourseNames);
        const isMajorRigor = isRequiredRigorCourse(course, requiredCourseNames)
          && isRequiredRigorCourse(course, rigorCourseNames);
        const fit = applyFoundationGapFit(course, inferCourseFit(course, studentProfile), isFoundationGap);
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
          fitType: fit.fitType,
          studySide: courseStudySideLabel(course),
          fitScore: Number(score.toFixed(2)),
          reason: buildReason(course, studentProfile, grade, { fit, isMajorRigor }),
          balanceReason: buildBalanceReason(course, studentProfile, fit),
        };
      });

    return {
      grade,
      targetCount: count,
      recommendations,
      balanceSummary: buildBalanceSummary(recommendations, studentProfile),
    };
  });

  return {
    items,
    notice: `已根据成绩与难点、文理均衡和先易后难顺序生成 ${futureGrades[0]} 至 12 年级 AP 选课计划，并优先引导学生在 11 年级、最晚 12 年级完成目标专业最高阶 AP 课程。${hasLoadCalibrationNeed(studentProfile) ? " 针对已说明的薄弱项，已按每年 2-3 门新增 AP 的稳妥负荷校准。" : ""}`,
  };
}
