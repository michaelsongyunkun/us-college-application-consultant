const DIMENSION_WEIGHTS = {
  major: 0.3,
  academics: 0.22,
  awards: 0.2,
  activities: 0.2,
  schoolTier: 0.08,
};

const TAG_GROUPS = [
  {
    key: "cs_ai_math",
    label: "计算机/AI/数学",
    terms: ["计算机", "computer", "cs", "ai", "人工智能", "数据", "编程", "python", "算法", "数学", "math"],
  },
  {
    key: "engineering",
    label: "工程/物理",
    terms: ["工程", "engineering", "物理", "机械", "材料", "机器人", "电子", "半导体", "能源"],
  },
  {
    key: "business_econ",
    label: "经济/商科",
    terms: ["经济", "商科", "business", "finance", "金融", "投资", "创业", "fbla", "nec", "ieo", "mec"],
  },
  {
    key: "bio_med",
    label: "生物/医学/公共卫生",
    terms: ["生物", "医学", "医疗", "公共卫生", "健康", "营养", "hosa", "bbo", "ibo", "igem", "脑科学"],
  },
  {
    key: "humanities_social",
    label: "人文社科/传媒",
    terms: ["哲学", "历史", "政治", "社会", "传媒", "communication", "写作", "辩论", "语言", "心理", "教育"],
  },
  {
    key: "arts",
    label: "艺术/戏剧/舞蹈",
    terms: ["艺术", "戏剧", "舞蹈", "theater", "音乐", "设计", "作品集", "电影"],
  },
  {
    key: "research",
    label: "科研/论文",
    terms: ["科研", "论文", "paper", "sci", "发表", "研究", "实验室", "教授", "专利"],
  },
  {
    key: "competition",
    label: "竞赛",
    terms: ["竞赛", "奥赛", "物理碗", "amc", "aime", "usaco", "bpho", "ukcho", "john locke", "ctb", "丘成桐"],
  },
  {
    key: "leadership",
    label: "领导力/社团",
    terms: ["社长", "创始人", "leader", "主席", "部长", "学生会", "组织者", "founder", "club"],
  },
  {
    key: "service",
    label: "公益/社区影响",
    terms: ["公益", "志愿", "支教", "社区", "募捐", "弱势", "儿童", "乡村", "ngo"],
  },
];

const SCHOOL_TIER_GROUPS = [
  {
    key: "top_us",
    label: "美国顶尖综合大学",
    terms: ["哈佛", "耶鲁", "普林斯顿", "斯坦福", "mit", "芝加哥", "哥伦比亚", "宾大", "杜克", "约翰霍普金斯", "康奈尔", "达特茅斯"],
  },
  {
    key: "uc",
    label: "UC 系",
    terms: ["ucla", "加州洛杉矶", "加州大学洛杉矶", "伯克利", "ucsd", "戴维斯", "uc"],
  },
  {
    key: "uk_oxbridge",
    label: "英国 G5/牛剑",
    terms: ["牛津", "剑桥", "帝国理工", "ucl", "伦敦大学学院"],
  },
  {
    key: "stem_power",
    label: "强 STEM 院校",
    terms: ["cmu", "卡内基梅隆", "佐治亚理工", "莱斯", "rice"],
  },
  {
    key: "liberal_arts",
    label: "文理学院/小型精英校",
    terms: ["文理学院", "里士满", "威廉姆斯", "阿默斯特", "波莫纳"],
  },
];

const MAJOR_TAG_KEYS = new Set([
  "cs_ai_math",
  "engineering",
  "business_econ",
  "bio_med",
  "humanities_social",
  "arts",
]);

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function includesAny(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagsForText(text, groups = TAG_GROUPS) {
  return groups.filter((group) => includesAny(text, group.terms)).map((group) => group.key);
}

function majorTagsForText(text) {
  return tagsForText(text).filter((tag) => MAJOR_TAG_KEYS.has(tag));
}

function hasProvidedMajor(value) {
  const text = normalizeText(value);
  return Boolean(text.trim()) && !includesAny(text, ["未提供", "未定", "undecided", "unknown", "n/a"]);
}

function tagLabel(key, groups = TAG_GROUPS) {
  return groups.find((group) => group.key === key)?.label || key;
}

function scoreTagOverlap(sourceTags, targetTags) {
  if (!sourceTags.length || !targetTags.length) return 0;
  const intersection = sourceTags.filter((tag) => targetTags.includes(tag)).length;
  const union = new Set([...sourceTags, ...targetTags]).size;
  return intersection / union;
}

function scoreTermOverlap(sourceText, targetText) {
  const sourceTokens = unique(
    normalizeText(sourceText)
      .split(/[^\p{Script=Han}a-z0-9+]+/u)
      .filter((token) => token.length >= 2),
  );
  const target = normalizeText(targetText);
  if (!sourceTokens.length || !target) return 0;
  const matched = sourceTokens.filter((token) => target.includes(token)).length;
  return matched / Math.max(sourceTokens.length, 5);
}

function parseCaseBlock(block, index) {
  const titleMatch = block.match(/^#{1,2}\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() || `案例 ${String(index + 1).padStart(2, "0")}`;
  const fields = {};
  const matches = [...block.matchAll(/##\s*(录取|专业|课程成绩|奖项|活动)\s*\n([\s\S]*?)(?=\n##\s*|\n---\s*$|$)/g)];

  for (const [, fieldName, valueBlock] of matches) {
    fields[fieldName] = valueBlock
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean)
      .join("；");
  }

  if (!matches.length) {
    for (const [, fieldName, value] of block.matchAll(/^\s*[-*]\s*(录取|专业|课程成绩|奖项|活动)\s*[：:]\s*(.+)$/gm)) {
      fields[fieldName] = value.trim();
    }
  }

  if (!fields["录取"] && !fields["专业"] && !fields["课程成绩"] && !fields["奖项"] && !fields["活动"]) {
    return null;
  }

  return {
    id: `case-${index + 1}`,
    admission: fields["录取"] || "未提供",
    major: fields["专业"] || "未提供",
    academics: fields["课程成绩"] || "未提供",
    awards: fields["奖项"] || "未提供",
    activities: fields["活动"] || "未提供",
    sourceTitle: title,
  };
}

export function parseAdmissionCasesMarkdown(markdown) {
  const text = String(markdown || "").trim();
  if (!text) return [];

  const blocks = text
    .split(/(?=^#{1,2}\s*案例\s*\d+)/m)
    .map((block) => block.trim())
    .filter((block) => /^#{1,2}\s*案例\s*\d+/m.test(block));

  return blocks.map(parseCaseBlock).filter(Boolean);
}

export function normalizeAdmissionCases(rawCases) {
  return (rawCases || [])
    .map((item, index) => ({
      id: item.id || `case-${index + 1}`,
      admission: item.admission || item["录取"] || "未提供",
      major: item.major || item["专业"] || "未提供",
      academics: item.academics || item["课程成绩"] || "未提供",
      awards: item.awards || item["奖项"] || "未提供",
      activities: item.activities || item["活动"] || "未提供",
      sourceTitle: item.sourceTitle || item.title || `案例 ${index + 1}`,
    }))
    .filter((item) => item.admission !== "未提供" || item.major !== "未提供");
}

export function buildStudentCaseProfile({ profile, activities, narrative }) {
  const profileText = Object.values(profile || {}).join(" ");
  const activityText = (activities || [])
    .map((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].join(" "),
    )
    .join(" ");
  const fullText = [profileText, activityText, narrative].join(" ");
  const majorText = hasProvidedMajor(profile?.majorDirection) ? profile?.majorDirection : profile?.interests;
  const awardsText = [profile?.coreStrengths, profile?.existingActivities, narrative].join(" ");

  return {
    rawText: fullText,
    grade: profile?.grade || "",
    majorText,
    academicText: [profileText, narrative].join(" "),
    awardsText,
    activityText,
    schoolText: [profile?.targetSchools, profile?.schoolTier, profileText, narrative].join(" "),
    tags: tagsForText(fullText),
    majorTags: majorTagsForText(majorText),
    academicTags: tagsForText([profileText, narrative].join(" ")),
    awardTags: tagsForText(awardsText),
    activityTags: tagsForText(activityText),
    schoolTierTags: tagsForText([profile?.targetSchools, profile?.schoolTier, profileText, narrative].join(" "), SCHOOL_TIER_GROUPS),
  };
}

function buildCaseProfile(admissionCase) {
  const allText = [
    admissionCase.admission,
    admissionCase.major,
    admissionCase.academics,
    admissionCase.awards,
    admissionCase.activities,
  ].join(" ");

  const majorSourceText = hasProvidedMajor(admissionCase.major)
    ? admissionCase.major
    : [admissionCase.major, admissionCase.admission].join(" ");

  return {
    majorTags: majorTagsForText(majorSourceText),
    academicTags: tagsForText(admissionCase.academics),
    awardTags: tagsForText(admissionCase.awards),
    activityTags: tagsForText(admissionCase.activities),
    schoolTierTags: tagsForText(admissionCase.admission, SCHOOL_TIER_GROUPS),
    allText,
  };
}

function hasMajorCompatibility(studentProfile, caseProfile) {
  if (!studentProfile.majorTags.length || !caseProfile.majorTags.length) return false;
  return studentProfile.majorTags.some((tag) => caseProfile.majorTags.includes(tag));
}

function formatMatchedLabels(tags) {
  return unique(tags.map((tag) => tagLabel(tag))).slice(0, 3);
}

function buildMatchReason(studentProfile, admissionCase, caseProfile, dimensionScores) {
  const overlap = formatMatchedLabels(
    unique([
      ...studentProfile.majorTags.filter((tag) => caseProfile.majorTags.includes(tag)),
      ...studentProfile.awardTags.filter((tag) => caseProfile.awardTags.includes(tag)),
      ...studentProfile.activityTags.filter((tag) => caseProfile.activityTags.includes(tag)),
    ]),
  );

  if (overlap.length) {
    return `该案例与当前学生在${overlap.join("、")}等方面有较高重合，可作为相近背景的申请路径参考。`;
  }

  const strongest = Object.entries(dimensionScores).sort((a, b) => b[1] - a[1])[0]?.[0];
  const fallback = {
    major: "专业方向",
    academics: "学术准备",
    awards: "奖项与成果",
    activities: "活动经历",
    schoolTier: "目标院校层级",
  }[strongest || "major"];

  return `该案例与当前学生在${fallback}上存在一定相似性，可作为方向接近的参考案例。`;
}

function buildTakeaway(studentProfile, admissionCase, caseProfile) {
  const ideas = [];
  if (caseProfile.awardTags.includes("research") || includesAny(admissionCase.awards, ["论文", "sci", "专利", "科研"])) {
    ideas.push("科研产出");
  }
  if (caseProfile.awardTags.includes("competition") || includesAny(admissionCase.awards, ["竞赛", "奥赛", "物理碗", "amc", "aime"])) {
    ideas.push("竞赛成果");
  }
  if (caseProfile.activityTags.includes("leadership")) {
    ideas.push("持续性的社团或项目领导力");
  }
  if (caseProfile.activityTags.includes("service")) {
    ideas.push("能证明影响力的公益或社区项目");
  }

  const selected = unique(ideas).slice(0, 3);
  if (selected.length) {
    return `后续可重点参考其${selected.join("、")}的积累方式，并结合当前学生已有基础做连续深化。`;
  }

  if (studentProfile.tags.length) {
    return "后续可参考该案例的主题聚焦方式，把已有活动串联成更清晰的申请叙事。";
  }

  return "建议先补充学生目标方向、成绩、奖项和活动信息，再判断可借鉴的背景提升路径。";
}

export function matchAdmissionCases({ studentProfile, cases, limit = 1 }) {
  const normalizedCases = normalizeAdmissionCases(cases);
  if (!studentProfile || !normalizedCases.length) return [];

  return normalizedCases
    .map((admissionCase) => {
      const caseProfile = buildCaseProfile(admissionCase);
      if (!hasMajorCompatibility(studentProfile, caseProfile)) return null;

      const dimensionScores = {
        major:
          0.75 * scoreTagOverlap(studentProfile.majorTags, caseProfile.majorTags) +
          0.25 * scoreTermOverlap(studentProfile.majorText, `${admissionCase.major} ${caseProfile.allText}`),
        academics:
          0.65 * scoreTagOverlap(studentProfile.academicTags, caseProfile.academicTags) +
          0.35 * scoreTermOverlap(studentProfile.academicText, admissionCase.academics),
        awards:
          0.7 * scoreTagOverlap(studentProfile.awardTags, caseProfile.awardTags) +
          0.3 * scoreTermOverlap(studentProfile.awardsText, admissionCase.awards),
        activities:
          0.7 * scoreTagOverlap(studentProfile.activityTags, caseProfile.activityTags) +
          0.3 * scoreTermOverlap(studentProfile.activityText, admissionCase.activities),
        schoolTier: scoreTagOverlap(studentProfile.schoolTierTags, caseProfile.schoolTierTags),
      };

      const score = Object.entries(DIMENSION_WEIGHTS).reduce(
        (total, [dimension, weight]) => total + dimensionScores[dimension] * weight,
        0,
      );

      return {
        case: admissionCase,
        score,
        strength: score >= 0.34 ? "high" : score >= 0.16 ? "related" : "low",
        dimensionScores,
        matchReason: buildMatchReason(studentProfile, admissionCase, caseProfile, dimensionScores),
        takeaway: buildTakeaway(studentProfile, admissionCase, caseProfile),
      };
    })
    .filter((match) => match?.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
