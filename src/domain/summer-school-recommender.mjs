import { classifyResource, enrichResourceEligibility } from "../domain/resource-eligibility.mjs";

const TIER_ORDER = ["冲刺型", "匹配型", "保底型"];
const TIER_RATINGS = {
  冲刺型: ["S+", "S", "A+"],
  匹配型: ["A", "B+"],
  保底型: ["B", "C+", "C"],
};

const CATEGORY_TAGS = {
  数学方向: ["math", "stem", "research"],
  物理方向: ["physics", "engineering", "stem", "research"],
  工程方向: ["engineering", "innovation", "stem"],
  "科创(综合科研)方向": ["research", "innovation", "stem"],
  人文社科方向: ["humanities", "social_science", "writing"],
  经济商科创业方向: ["business", "economics", "innovation"],
  "AI 计算机科学方向": ["cs", "ai", "engineering", "stem"],
  艺术方向: ["arts", "portfolio"],
};

const TEXT_TAGS = [
  { tag: "math", label: "数学", terms: ["数学", "math", "aime", "amc", "建模", "微积分", "统计", "数论"] },
  { tag: "cs", label: "计算机", terms: ["计算机", "cs", "编程", "程序", "python", "算法", "usaco", "信息学"] },
  { tag: "ai", label: "AI", terms: ["ai", "人工智能", "机器学习", "数据", "模型", "自动驾驶"] },
  { tag: "physics", label: "物理", terms: ["物理", "physics", "天文", "量子", "力学"] },
  { tag: "engineering", label: "工程", terms: ["工程", "engineering", "机器人", "机械", "航天", "电子", "硬件"] },
  { tag: "research", label: "科研", terms: ["科研", "研究", "论文", "实验室", "发表", "教授", "课题"] },
  { tag: "innovation", label: "科创", terms: ["科创", "创新", "发明", "专利", "产品", "app", "创业"] },
  { tag: "business", label: "商科", terms: ["商科", "商业", "金融", "投资", "创业", "business"] },
  { tag: "economics", label: "经济", terms: ["经济", "economics", "宏观", "微观"] },
  { tag: "humanities", label: "人文", terms: ["人文", "历史", "世界史", "哲学", "文学", "语言", "宗教", "history", "humanities", "philosophy", "literature", "religious studies", "classics", "archaeology", "museum"] },
  { tag: "social_science", label: "社科", terms: ["社科", "政治", "社会", "心理", "教育", "传媒", "公共政策", "法律", "social science", "political science", "politics", "sociology", "psychology", "education", "public policy", "law", "anthropology", "international relations"] },
  { tag: "writing", label: "写作", terms: ["写作", "essay", "辩论", "媒体", "新闻", "writing", "journalism", "debate", "newspaper", "publication"] },
  { tag: "arts", label: "艺术", terms: ["艺术", "音乐", "戏剧", "舞蹈", "设计", "电影", "摄影", "作品集"] },
  { tag: "portfolio", label: "作品集", terms: ["作品集", "portfolio", "绘画", "建筑"] },
  { tag: "stem", label: "STEM", terms: ["stem", "科学", "工程", "技术"] },
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagText(text) {
  const normalized = normalizeText(text);
  return TEXT_TAGS.filter((group) => group.terms.some((term) => normalized.includes(term.toLowerCase()))).map(
    (group) => group.tag,
  );
}

function tagLabel(tag) {
  return TEXT_TAGS.find((group) => group.tag === tag)?.label || tag;
}

function primaryTagsFromText(text) {
  const genericTags = new Set(["stem", "research", "innovation", "portfolio"]);
  return tagText(text).filter((tag) => !genericTags.has(tag));
}

function hasProvidedMajor(value) {
  const text = normalizeText(value);
  return Boolean(text.trim()) && !["未提供", "未定", "undecided", "unknown", "n/a"].some((term) => text.includes(term));
}

function expandAllowedTags(primaryTags) {
  const allowed = new Set(primaryTags);
  if (primaryTags.some((tag) => ["humanities", "social_science", "writing"].includes(tag))) {
    ["humanities", "social_science", "writing", "arts"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.some((tag) => ["math", "cs", "ai", "physics", "engineering"].includes(tag))) {
    ["stem", "research", "innovation", "engineering"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.some((tag) => ["business", "economics"].includes(tag))) {
    ["business", "economics", "social_science", "innovation"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.includes("arts")) {
    ["arts", "portfolio", "humanities", "writing"].forEach((tag) => allowed.add(tag));
  }
  return [...allowed];
}

function cleanDirectionHeading(heading) {
  return String(heading || "")
    .replace(/^#\s*/, "")
    .replace(/^[^\p{Script=Han}A-Za-z0-9]+/u, "")
    .replace(/^[一二三四五六七八九十]+、/, "")
    .trim();
}

export function normalizeRating(value) {
  const match = String(value || "").match(/S\+|A\+|B\+|C\+|S|A|B|C/i);
  return match ? match[0].toUpperCase() : "";
}

export function tierForRating(rating) {
  const normalized = normalizeRating(rating);
  return TIER_ORDER.find((tier) => TIER_RATINGS[tier].includes(normalized)) || "";
}

function parseFieldValue(line) {
  return line.replace(/^\s*-\s*\*\*[^*]+?\*\*：?\s*/, "").trim();
}

function normalizeWebsiteLine(line) {
  return line
    .replace(/^\s*官网：?/, "官网：")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
}

function parseRequirements(lines) {
  return lines
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

function parseSummerSchoolBlock(block, index, category) {
  const name = block.match(/^##\s*\d+\.\s*(.+)$/m)?.[1]?.trim();
  if (!name) return null;

  const fields = {
    formatAndWebsite: "",
    description: "",
    rawRating: "",
    admissionRate: "",
    requirements: [],
    programTime: "",
    applicationTime: "",
  };

  const lines = block.split(/\r?\n/);
  let activeField = "";
  const descriptionLines = [];
  const formatLines = [];
  const requirementLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- **形式 & 官网**")) {
      activeField = "formatAndWebsite";
      formatLines.push(parseFieldValue(trimmed));
      continue;
    }
    if (trimmed.startsWith("官网：")) {
      formatLines.push(normalizeWebsiteLine(trimmed));
      continue;
    }
    if (trimmed.startsWith("- **简介**")) {
      activeField = "description";
      const value = parseFieldValue(trimmed);
      if (value) descriptionLines.push(value);
      continue;
    }
    if (trimmed.startsWith("- **含金量**")) {
      activeField = "";
      fields.rawRating = parseFieldValue(trimmed);
      continue;
    }
    if (trimmed.startsWith("- **录取率**")) {
      activeField = "";
      fields.admissionRate = parseFieldValue(trimmed);
      continue;
    }
    if (trimmed.startsWith("- **申请要求**")) {
      activeField = "requirements";
      continue;
    }
    if (trimmed.startsWith("- **举办时间**")) {
      activeField = "";
      fields.programTime = parseFieldValue(trimmed);
      continue;
    }
    if (trimmed.startsWith("- **申请时间**")) {
      activeField = "";
      fields.applicationTime = parseFieldValue(trimmed);
      continue;
    }
    if (!trimmed || trimmed.startsWith("## ")) continue;

    if (activeField === "description") descriptionLines.push(trimmed.replace(/^\s*-\s*/, ""));
    if (activeField === "requirements" && trimmed.startsWith("- ")) requirementLines.push(trimmed);
  }

  const rating = normalizeRating(fields.rawRating);
  return {
    id: `summer-school-${index + 1}`,
    name,
    category,
    formatAndWebsite: formatLines.filter(Boolean).join(" "),
    description: descriptionLines.filter(Boolean).join(" "),
    rating,
    rawRating: fields.rawRating,
    tier: tierForRating(rating),
    admissionRate: fields.admissionRate,
    requirements: parseRequirements(requirementLines),
    programTime: fields.programTime,
    applicationTime: fields.applicationTime,
  };
}

export function parseSummerSchoolsMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let category = "";
  let current = [];

  for (const line of lines) {
    if (line.startsWith("# ") && !line.includes("国际夏校项目清洗标注")) {
      if (current.length) blocks.push({ category, block: current.join("\n") });
      category = cleanDirectionHeading(line);
      current = [];
      continue;
    }
    if (line.startsWith("## ")) {
      if (current.length) blocks.push({ category, block: current.join("\n") });
      current = [line];
      continue;
    }
    if (current.length) current.push(line);
  }
  if (current.length) blocks.push({ category, block: current.join("\n") });

  return blocks.map(({ block, category: blockCategory }, index) => parseSummerSchoolBlock(block, index, blockCategory)).filter(Boolean);
}

export function buildSummerSchoolStudentProfile({ profile, activities, narrative }) {
  const { schoolContext = "", identityDescription = "", ...planningProfile } = profile || {};
  const profileText = Object.values(planningProfile).join(" ");
  const activityText = (activities || [])
    .map((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].join(" "),
    )
    .join(" ");
  const text = [profileText, activityText, narrative].join(" ");
  const primaryText = hasProvidedMajor(profile?.majorDirection) ? profile?.majorDirection : profile?.interests;
  const primaryTags = primaryTagsFromText(primaryText);

  return {
    grade: profile?.grade || "",
    text,
    tags: tagText(text),
    primaryTags: primaryTags.length ? primaryTags : primaryTagsFromText(text),
    eligibilityFilters: { schoolContext, identityDescription },
    hasAnyInput: Boolean(text.trim()),
    hasEnoughInfo: Boolean(profile?.majorDirection && profile?.grade && (profile?.interests || profile?.coreStrengths)),
  };
}

function summerSchoolTags(summerSchool) {
  return unique([
    ...(CATEGORY_TAGS[summerSchool.category] || []),
    ...tagText([summerSchool.name, summerSchool.category, summerSchool.description, summerSchool.requirements.join(" ")].join(" ")),
  ]);
}

function scoreSummerSchool(summerSchool, studentProfile) {
  const itemTags = summerSchoolTags(summerSchool);
  if (!studentProfile.tags.length) return 0;
  const overlap = itemTags.filter((tag) => studentProfile.tags.includes(tag)).length;
  const categoryBonus = itemTags.some((tag) => studentProfile.tags.includes(tag)) ? 0.2 : 0;
  const gradeText = `${summerSchool.requirements.join(" ")} ${summerSchool.programTime} ${summerSchool.applicationTime}`;
  const gradeBonus = studentProfile.grade && gradeText.includes(studentProfile.grade.replace("年级", "")) ? 0.08 : 0;
  return overlap / Math.max(studentProfile.tags.length, 3) + categoryBonus + gradeBonus;
}

function buildReason(summerSchool, studentProfile, tier) {
  const matched = summerSchoolTags(summerSchool)
    .filter((tag) => studentProfile.tags.includes(tag))
    .map(tagLabel)
    .slice(0, 3);
  const matchText = matched.length ? `与当前学生的${matched.join("、")}方向匹配` : "与当前学生已填写的背景存在一定关联";
  const tierText =
    tier === "冲刺型"
      ? "可作为高含金量学术背书目标"
      : tier === "匹配型"
        ? "难度和学术探索强度较适合作为主申方向补充"
        : "适合用于补足夏季学术探索和项目经历";
  return `${matchText}，${tierText}；其${summerSchool.category}定位有助于围绕目标专业形成更清晰的申请叙事。`;
}

function decorateRecommendation(summerSchool, tier, studentProfile) {
  return {
    ...summerSchool,
    tier,
    reason: buildReason(summerSchool, studentProfile, tier),
  };
}

function pickForTier({ tier, scored, seenIds, previousBatchIds, usedIds, batchIndex }) {
  const candidates = scored
    .filter((item) => item.summerSchool.tier === tier && !usedIds.includes(item.summerSchool.id))
    .sort((a, b) => b.score - a.score || a.summerSchool.name.localeCompare(b.summerSchool.name, "zh-CN"));

  const fresh = candidates.filter(
    (item) => !seenIds.includes(item.summerSchool.id) && !previousBatchIds.includes(item.summerSchool.id),
  );
  const notPrevious = candidates.filter((item) => !previousBatchIds.includes(item.summerSchool.id));
  const pool = fresh.length ? fresh : notPrevious.length ? notPrevious : candidates;
  if (!pool.length) return null;
  return pool[batchIndex % pool.length].summerSchool;
}

function filterByAllowedTags(scoredItems, allowedTags) {
  if (!allowedTags.length) return scoredItems;
  return scoredItems.filter((item) => item.tags.some((tag) => allowedTags.includes(tag)));
}

function filterEligibleSummerSchools(summerSchools, studentProfile) {
  let excludedCount = 0;
  const items = summerSchools.filter((summerSchool) => {
    const excluded = classifyResource(
      enrichResourceEligibility(summerSchool),
      studentProfile.eligibilityFilters || {},
    ).excluded;
    if (excluded) excludedCount += 1;
    return !excluded;
  });
  return { items, excludedCount };
}

export function recommendSummerSchools({ studentProfile, summerSchools, seenIds = [], previousBatchIds = [], batchIndex = 0 }) {
  const normalized = summerSchools || [];
  if (!studentProfile || !studentProfile.hasAnyInput || !normalized.length) {
    return {
      items: [],
      notice: "填写用户背景信息后，将根据学生方向生成夏校推荐。",
    };
  }

  const eligible = filterEligibleSummerSchools(normalized, studentProfile);
  const scored = eligible.items
    .filter((summerSchool) => summerSchool.tier)
    .map((summerSchool) => ({
      summerSchool,
      score: scoreSummerSchool(summerSchool, studentProfile),
      tags: summerSchoolTags(summerSchool),
    }));
  const focusScored = filterByAllowedTags(scored, studentProfile.primaryTags || []);
  const relevantScored = filterByAllowedTags(scored, expandAllowedTags(studentProfile.primaryTags || []));
  const scopedScored = focusScored.length ? focusScored : relevantScored.length ? relevantScored : scored;

  const usedIds = [];
  const items = [];
  for (const tier of TIER_ORDER) {
    const picked = pickForTier({ tier, scored: scopedScored, seenIds, previousBatchIds, usedIds, batchIndex });
    if (picked) {
      usedIds.push(picked.id);
      items.push(decorateRecommendation(picked, tier, studentProfile));
    }
  }

  return {
    items,
    notice: [
      studentProfile.hasAnyInput && !studentProfile.hasEnoughInfo
        ? "当前推荐基于已填写信息生成，补充目标专业、年级和兴趣方向后，可进一步提高匹配准确度。"
        : "",
      eligible.excludedCount
        ? `已依据当前可参与条件排除 ${eligible.excludedCount} 个明确不符合申请要求的夏校。`
        : "",
    ].filter(Boolean).join(" "),
  };
}
