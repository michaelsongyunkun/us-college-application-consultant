import { classifyResource, enrichResourceEligibility } from "../domain/resource-eligibility.mjs";

const CATEGORY_TAGS = {
  数学类: ["math", "quant", "stem"],
  物理类: ["physics", "engineering", "stem"],
  化学类: ["chemistry", "science", "stem"],
  生物类: ["biology", "medicine", "science"],
  计算机类: ["cs", "ai", "engineering", "stem"],
  经济商科类: ["business", "economics"],
  科创类: ["innovation", "research", "engineering", "stem"],
  人文社科类: ["humanities", "social_science", "writing"],
  爱好类: ["arts", "hobby", "leadership"],
};

const TEXT_TAGS = [
  { tag: "math", label: "数学", terms: ["数学", "math", "aime", "amc", "建模", "微积分", "统计", "数论"] },
  { tag: "cs", label: "计算机", terms: ["计算机", "cs", "编程", "程序", "python", "算法", "usaco", "acsl", "信息学"] },
  { tag: "ai", label: "AI", terms: ["ai", "人工智能", "机器学习", "数据", "模型"] },
  { tag: "physics", label: "物理", terms: ["物理", "physics", "工程", "机器人", "机械", "航天", "天文"] },
  { tag: "chemistry", label: "化学", terms: ["化学", "chemistry", "材料", "分子", "实验"] },
  { tag: "biology", label: "生物", terms: ["生物", "biology", "医学", "医疗", "健康", "脑", "公共卫生"] },
  { tag: "business", label: "商科", terms: ["商科", "商业", "经济", "金融", "投资", "创业", "business", "econ"] },
  { tag: "economics", label: "经济", terms: ["经济", "economics", "宏观", "微观", "金融"] },
  { tag: "innovation", label: "科创", terms: ["科创", "创新", "发明", "专利", "产品", "app", "硬件"] },
  { tag: "research", label: "科研", terms: ["科研", "研究", "论文", "实验室", "发表", "教授"] },
  { tag: "humanities", label: "人文", terms: ["人文", "历史", "世界史", "哲学", "文学", "语言", "宗教", "history", "humanities", "philosophy", "literature", "religious studies", "classics", "archaeology", "museum"] },
  { tag: "social_science", label: "社科", terms: ["社科", "政治", "社会", "心理", "教育", "传媒", "公共政策", "法律", "social science", "political science", "politics", "sociology", "psychology", "education", "public policy", "law", "anthropology", "international relations"] },
  { tag: "writing", label: "写作", terms: ["写作", "论文", "essay", "辩论", "媒体", "新闻", "writing", "journalism", "debate", "newspaper", "publication"] },
  { tag: "arts", label: "艺术", terms: ["艺术", "音乐", "戏剧", "舞蹈", "设计", "电影", "摄影"] },
  { tag: "leadership", label: "领导力", terms: ["社团", "社长", "创始", "leader", "主席", "公益", "志愿"] },
  { tag: "hobby", label: "兴趣爱好", terms: ["体育", "运动", "钢琴", "长笛", "摄影", "播客", "博客"] },
  { tag: "stem", label: "STEM", terms: ["stem", "科学", "工程", "技术"] },
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function includesTerm(text, term) {
  return normalizeText(text).includes(term.toLowerCase());
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tagText(text) {
  const normalized = normalizeText(text);
  const tags = TEXT_TAGS.filter((group) => group.terms.some((term) => normalized.includes(term.toLowerCase()))).map(
    (group) => group.tag,
  );
  if (/\b(isef|research|science fair)\b/i.test(normalized)) tags.push("research");
  if (/\b(conrad|innovation)\b/i.test(normalized)) tags.push("innovation");
  return unique(tags);
}

function tagLabel(tag) {
  return TEXT_TAGS.find((group) => group.tag === tag)?.label || tag;
}

function primaryTagsFromText(text) {
  const genericTags = new Set(["stem", "research", "innovation", "leadership", "hobby"]);
  return tagText(text).filter((tag) => !genericTags.has(tag));
}

function hasProvidedMajor(value) {
  const text = normalizeText(value);
  return Boolean(text.trim()) && !["未提供", "未定", "undecided", "unknown", "n/a"].some((term) => text.includes(term));
}

function expandAllowedTags(primaryTags) {
  const allowed = new Set(primaryTags);
  if (primaryTags.some((tag) => ["humanities", "social_science", "writing"].includes(tag))) {
    ["humanities", "social_science", "writing", "arts", "hobby", "leadership"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.some((tag) => ["math", "cs", "ai", "physics", "chemistry", "biology", "engineering"].includes(tag))) {
    ["stem", "research", "innovation", "engineering"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.some((tag) => ["business", "economics"].includes(tag))) {
    ["business", "economics", "social_science", "innovation", "leadership"].forEach((tag) => allowed.add(tag));
  }
  if (primaryTags.includes("arts")) {
    ["arts", "hobby", "humanities", "writing", "portfolio"].forEach((tag) => allowed.add(tag));
  }
  return [...allowed];
}

function categoryFromHeading(heading) {
  return String(heading || "")
    .replace(/^#+\s*/, "")
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/^[^\p{Script=Han}A-Za-z0-9]+/u, "")
    .replace(/^[一二三四五六七八九十]+、/, "")
    .trim();
}

export function rateCompetition(competition) {
  const originalText = [competition?.name, competition?.category, competition?.raw].join(" ");
  const text = normalizeText(originalText);
  const hasOlympiadSignal =
    /olympiad|olympiads|olympique|奥林匹克|奥赛|奥林匹克竞赛|奥林匹克挑战|物理碗|physics bowl/i.test(originalText);
  const hasUniversityLeagueSignal =
    /harvard|mit|princeton|stanford|berkeley|caltech|duke|yale|cmu|carnegie|cornell|columbia|penn|upenn|waterloo|滑铁卢|哈佛|普林斯顿|斯坦福|伯克利|加州理工|杜克|耶鲁|卡内基|康奈尔|哥伦比亚|宾大|大学/.test(
      text,
    ) &&
    /tournament|championship|invitational|contest|challenge|competition|联赛|锦标赛|邀请赛|竞赛|挑战赛/.test(text);

  if (
    /丘成桐|yau|isef|regeneron sts|research science institute|\brsi\b|davidson fellows|usamo|usajmo|usapho|usnco|mop|national finals|国家队|集训队/.test(
      text,
    ) ||
    /\b(imo|ipho|icho|ibo|ioi|ioai|iypt|ioaa|apmo|apho|apio|apbo|ijso|euso)\b/.test(text)
  ) {
    return "S";
  }

  if (
    hasOlympiadSignal ||
    hasUniversityLeagueSignal ||
    /aime|usaco|bpho|ukcho|brain bee|hosa|igem|john locke|nec|ieo|wharton|conrad|jshs|sts|hmmt|pumac|cmimc|bmt|smt|chmmc|mmaths|hmic|moaa|pupc|proco|hspc|math prize|young physicists|beamline for schools|genius olympiad/i.test(
      originalText,
    )
  ) {
    return "A";
  }

  if (
    /amc 8|amc 10|amc 12|\bamc\b|bebras|fbla|ctb|math league|purple comet|mathcounts|himcm|midmcm|immc|euclid|comc|cimc|fermat|cayley|pascal|hypatia|galois|fryer|bmo|essay competition|写作|辩论|model united nations|模联/i.test(
      originalText,
    )
  ) {
    return "B";
  }

  if (/kangaroo|袋鼠|moems|sasmo|simoc|wmi|趣味|quiz|入门|校内/i.test(originalText)) {
    return "C";
  }

  return "B";
}

function parseCompetitionLine(line, index, categoryRaw) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return null;

  const explicitRating = trimmed.match(/评级[：:]\s*([SABC])/i)?.[1]?.toUpperCase() || "";
  const content = trimmed.replace(/^-\s*(?:\*\*评级[：:]\s*[SABC]\*\*\s*[｜|]\s*)?/i, "- ");
  const markdownLink = content.match(/^-\s*\[([^\]]+)\]\(([^)]+)\)/);
  const name = markdownLink ? markdownLink[1].trim() : content.replace(/^-\s*/, "").split(/[—-]\s*官网/)[0].trim();
  const url = markdownLink ? markdownLink[2].trim() : "";
  if (!name) return null;

  const category = categoryFromHeading(categoryRaw);
  const competition = {
    name,
    category,
    raw: trimmed,
  };
  return {
    id: `competition-${index + 1}`,
    name,
    url,
    category,
    categoryRaw,
    rating: explicitRating || rateCompetition(competition),
    raw: trimmed,
  };
}

function parseFieldValue(block, label) {
  return block.match(new RegExp(`^- \\*\\*${label}\\*\\*：(.+)$`, "m"))?.[1]?.trim() || "";
}

function parseWebsite(value) {
  return value.match(/\]\(([^)]+)\)/)?.[1]?.trim() || value.match(/https?:\/\/\S+/)?.[0] || "";
}

function parseDetailedCompetitionBlock(block, index, categoryRaw, subcategory) {
  const name = block.match(/^####\s+(.+)$/m)?.[1]?.trim();
  if (!name) return null;
  const explicitRating = parseFieldValue(block, "评级");
  const requirements = ["申请要求", "报名条件", "参赛条件"]
    .map((label) => parseFieldValue(block, label))
    .filter(Boolean);
  const competition = {
    id: `competition-${index + 1}`,
    name,
    url: parseWebsite(parseFieldValue(block, "官网")),
    category: categoryFromHeading(categoryRaw),
    categoryRaw,
    subcategory,
    rating: explicitRating || rateCompetition({ name, category: categoryRaw, raw: block }),
    time: parseFieldValue(block, "时间"),
    description: parseFieldValue(block, "简介"),
    awards: parseFieldValue(block, "奖项"),
    raw: block.trim(),
  };
  if (requirements.length) competition.requirements = requirements;
  return competition;
}

function parseDetailedCompetitionsMarkdown(markdown) {
  const competitions = [];
  let categoryRaw = "";
  let subcategory = "";
  let current = [];

  function addCurrent() {
    if (!current.length) return;
    const competition = parseDetailedCompetitionBlock(
      current.join("\n"),
      competitions.length,
      categoryRaw,
      subcategory,
    );
    if (competition) competitions.push(competition);
    current = [];
  }

  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      addCurrent();
      categoryRaw = line.replace(/^##\s+/, "").trim();
      subcategory = "";
      continue;
    }
    if (/^###\s+/.test(line)) {
      addCurrent();
      subcategory = line.replace(/^###\s+/, "").trim();
      continue;
    }
    if (/^####\s+/.test(line)) {
      addCurrent();
      current = [line];
      continue;
    }
    if (current.length) current.push(line);
  }
  addCurrent();
  return competitions;
}

export function parseCompetitionsMarkdown(markdown) {
  if (/^####\s+/m.test(String(markdown || ""))) {
    return parseDetailedCompetitionsMarkdown(markdown);
  }
  const competitions = [];
  let categoryRaw = "";

  for (const line of String(markdown || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const heading = trimmed.replace(/^#\s*/, "");
      categoryRaw = /评级清单|评级说明|评级统计|正文/.test(heading) ? "" : heading;
      continue;
    }
    if (!categoryRaw) continue;

    const competition = parseCompetitionLine(trimmed, competitions.length, categoryRaw);
    if (competition) competitions.push(competition);
  }

  return competitions;
}

export function buildCompetitionStudentProfile({ profile, activities, narrative }) {
  const { schoolContext = "", identityDescription = "", ...planningProfile } = profile || {};
  const profileValues = Object.values(planningProfile).join(" ");
  const activityText = (activities || [])
    .map((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].join(" "),
    )
    .join(" ");
  const fullText = [profileValues, activityText, narrative].join(" ");
  const primaryText = hasProvidedMajor(profile?.majorDirection) ? profile?.majorDirection : profile?.interests;
  const expansionText = [profile?.coreStrengths, profile?.existingActivities, profile?.interests].join(" ");
  const hasAnyInput = Boolean(fullText.trim());
  const hasCoreFields = Boolean(profile?.majorDirection && profile?.grade && (profile?.interests || profile?.coreStrengths));
  const primaryTags = primaryTagsFromText(primaryText);
  const expansionTags = unique([...tagText(expansionText), ...primaryTagsFromText(expansionText)]);

  return {
    grade: profile?.grade || "",
    text: fullText,
    tags: tagText(fullText),
    primaryTags: primaryTags.length ? primaryTags : primaryTagsFromText(fullText),
    expansionTags: expansionTags.length ? expansionTags : tagText(fullText),
    eligibilityFilters: { schoolContext, identityDescription },
    hasAnyInput,
    hasEnoughInfo: hasCoreFields,
  };
}

function competitionTags(competition) {
  return unique([
    ...(CATEGORY_TAGS[competition.category] || []),
    ...tagText(`${competition.name} ${competition.categoryRaw} ${competition.raw}`),
  ]);
}

function overlapScore(studentTags, itemTags) {
  if (!studentTags.length || !itemTags.length) return 0;
  const overlap = itemTags.filter((tag) => studentTags.includes(tag)).length;
  return overlap / Math.max(studentTags.length, 3);
}

function scoreCompetition(competition, studentProfile) {
  const itemTags = competitionTags(competition);
  const directTextBonus = studentProfile.tags.some((tag) => includesTerm(competition.name, tagLabel(tag))) ? 0.15 : 0;
  const advancedPathBonus = /olympiad|奥林匹克|奥赛|aime|usaco|usapho|icho|ibo|ioi|imo/i.test(competition.name)
    ? 0.04
    : 0;
  return overlapScore(studentProfile.tags, itemTags) + directTextBonus + advancedPathBonus;
}

function buildReason(competition, recommendationType, studentProfile) {
  const itemTags = competitionTags(competition);
  const matched = itemTags.filter((tag) => studentProfile.tags.includes(tag)).map(tagLabel).slice(0, 3);
  if (matched.length) {
    return `${competition.name} 与当前学生的${matched.join("、")}方向匹配度较高，适合作为${recommendationType}竞赛进行规划。`;
  }
  if (recommendationType === "学科强相关") {
    return `${competition.name} 属于${competition.category}，可承接学生已填写的学术方向和课程背景。`;
  }
  return `${competition.name} 可作为主线学科之外的拓展选择，帮助补充申请材料中的多元探索。`;
}

function buildApplicationHelp(competition, recommendationType) {
  if (recommendationType === "学科强相关") {
    return `有助于证明${competition.category}相关的学术兴趣、课程延展能力和竞赛挑战意识。`;
  }
  return "有助于丰富活动结构，展示跨学科探索、主动性和个人兴趣的延展性。";
}

function buildPrepTime(competition, studentProfile) {
  if (/olympiad|奥林匹克|奥赛|usamo|usapho|icho|ibo|ioi|imo/i.test(competition.name)) {
    return studentProfile.grade ? `${studentProfile.grade} 起持续 6-12 个月准备` : "建议预留 6-12 个月准备";
  }
  if (/essay|写作|research|challenge|科创|isef|conrad|丘成桐/i.test(competition.name)) {
    return "建议预留 3-6 个月完成选题、作品或项目打磨";
  }
  return "建议预留 2-4 个月完成基础训练与参赛材料准备";
}

function decorateRecommendation(competition, recommendationType, studentProfile) {
  return {
    ...competition,
    recommendationType,
    url: competition.url || "官网待确认",
    recommendationReason: buildReason(competition, recommendationType, studentProfile),
    applicationHelp: buildApplicationHelp(competition, recommendationType),
    prepTime: buildPrepTime(competition, studentProfile),
  };
}

function rotate(items, offset) {
  if (!items.length) return [];
  const safeOffset = offset % items.length;
  return [...items.slice(safeOffset), ...items.slice(0, safeOffset)];
}

function pickItems(candidates, count, avoidIds, fallback = []) {
  const preferred = candidates.filter((item) => !avoidIds.includes(item.id));
  const merged = [...preferred, ...candidates, ...fallback];
  const picked = [];
  for (const item of merged) {
    if (avoidIds.includes(item.id)) continue;
    if (picked.some((pickedItem) => pickedItem.id === item.id)) continue;
    picked.push(item);
    if (picked.length === count) break;
  }
  return picked;
}

function filterByAllowedTags(scoredItems, allowedTags) {
  if (!allowedTags.length) return scoredItems;
  return scoredItems.filter((item) => item.tags.some((tag) => allowedTags.includes(tag)));
}

function sortByTagFit(scoredItems, tags) {
  if (!tags?.length) return scoredItems;
  return [...scoredItems].sort(
    (a, b) =>
      overlapScore(tags, b.tags) - overlapScore(tags, a.tags) ||
      b.score - a.score ||
      a.competition.name.localeCompare(b.competition.name, "zh-CN"),
  );
}

function filterEligibleCompetitions(competitions, studentProfile) {
  let excludedCount = 0;
  const items = competitions.filter((competition) => {
    const excluded = classifyResource(
      enrichResourceEligibility(competition),
      studentProfile.eligibilityFilters || {},
    ).excluded;
    if (excluded) excludedCount += 1;
    return !excluded;
  });
  return { items, excludedCount };
}

function normalizeCompetitionIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?/u, "")
    .replace(/[/?#]+$/u, "")
    .replace(/[^a-z0-9\p{Script=Han}]+/gu, "");
}

function competitionDeduplicationKey(competition) {
  const urlKey = normalizeCompetitionIdentity(competition.url);
  return urlKey ? `url:${urlKey}` : `name:${normalizeCompetitionIdentity(competition.name)}`;
}

function deduplicateCompetitions(competitions) {
  const items = [];
  const indexByKey = new Map();
  let duplicateCount = 0;
  for (const competition of competitions) {
    const key = competitionDeduplicationKey(competition);
    if (!key || key.endsWith(":")) {
      items.push(competition);
      continue;
    }
    if (!indexByKey.has(key)) {
      indexByKey.set(key, items.length);
      items.push(competition);
      continue;
    }
    items[indexByKey.get(key)] = competition;
    duplicateCount += 1;
  }
  return { items, duplicateCount };
}

export function recommendCompetitions({ studentProfile, competitions, previousBatchIds = [], batchIndex = 0 }) {
  const normalized = competitions || [];
  if (!studentProfile || !normalized.length) {
    return { items: [], notice: "竞赛库暂无匹配项。" };
  }
  if (!studentProfile.hasAnyInput) {
    return { items: [], notice: "填写用户背景信息后，将根据学生方向生成国际竞赛推荐。" };
  }

  const deduplicated = deduplicateCompetitions(normalized);
  const eligible = filterEligibleCompetitions(deduplicated.items, studentProfile);
  const scored = eligible.items
    .map((competition) => ({
      competition,
      score: scoreCompetition(competition, studentProfile),
      tags: competitionTags(competition),
    }))
    .sort((a, b) => b.score - a.score || a.competition.name.localeCompare(b.competition.name, "zh-CN"));

  const studentTags = studentProfile.tags;
  const allowedTags = expandAllowedTags(studentProfile.primaryTags || []);
  const focusScored = filterByAllowedTags(scored, studentProfile.primaryTags || []);
  const relevantScored = filterByAllowedTags(scored, allowedTags);
  const scopedScored = focusScored.length ? focusScored : relevantScored.length ? relevantScored : scored;
  const expansionAllowedTags = expandAllowedTags(studentProfile.expansionTags || []);
  const expansionScored = sortByTagFit(
    filterByAllowedTags(scored, expansionAllowedTags).length ? filterByAllowedTags(scored, expansionAllowedTags) : scopedScored,
    studentProfile.expansionTags || [],
  );
  const strongCategories = new Set(
    scopedScored
      .filter((item) => item.score > 0 || item.tags.some((tag) => studentTags.includes(tag)))
      .slice(0, 80)
      .map((item) => item.competition.category),
  );
  const relevantCandidates = (relevantScored.length ? relevantScored : scopedScored).map((item) => item.competition);

  const strongCandidates = rotate(
    scopedScored.filter((item) => strongCategories.has(item.competition.category)).map((item) => item.competition),
    batchIndex * 3,
  );
  const expansionCandidates = rotate(
    expansionScored
      .filter((item) => item.tags.some((tag) => (studentProfile.expansionTags || []).includes(tag)))
      .map((item) => item.competition),
    batchIndex * 5,
  );

  const avoidIds = previousBatchIds || [];
  const strong = pickItems(strongCandidates, 3, avoidIds, relevantCandidates);
  const expansionAvoid = [...avoidIds, ...strong.map((item) => item.id)];
  const expansionFallback = expansionScored.map((item) => item.competition);
  const expansion = pickItems(expansionCandidates, 2, expansionAvoid, expansionFallback);

  let selected = [
    ...strong.map((item) => decorateRecommendation(item, "学科强相关", studentProfile)),
    ...expansion.map((item) => decorateRecommendation(item, "拓展型", studentProfile)),
  ];

  if (selected.length < 5) {
    const existingIds = selected.map((item) => item.id);
    const fillerPool = scopedScored.length ? scopedScored.map((item) => item.competition) : eligible.items;
    const fillers = fillerPool
      .filter((item) => !existingIds.includes(item.id))
      .slice(0, 5 - selected.length)
      .map((item) => decorateRecommendation(item, selected.length < 3 ? "学科强相关" : "拓展型", studentProfile));
    selected = [...selected, ...fillers];
  }

  const previousSet = (previousBatchIds || []).join("|");
  if (selected.map((item) => item.id).join("|") === previousSet && eligible.items.length > selected.length) {
    const replacement = eligible.items.find((item) => !selected.some((selectedItem) => selectedItem.id === item.id));
    if (replacement) selected[selected.length - 1] = decorateRecommendation(replacement, "拓展型", studentProfile);
  }

  return {
    items: selected.slice(0, 5),
    notice: [
      studentProfile.hasAnyInput && !studentProfile.hasEnoughInfo
        ? "当前推荐基于已填写信息生成，补充目标专业、年级和兴趣方向后，可进一步提高匹配准确度。"
        : "",
      eligible.excludedCount
        ? `已依据当前可参与条件排除 ${eligible.excludedCount} 个明确不符合报名要求的竞赛。`
        : "",
      deduplicated.duplicateCount
        ? `已按规范化官网与名称合并 ${deduplicated.duplicateCount} 个重复竞赛条目。`
        : "",
    ].filter(Boolean).join(" "),
  };
}
