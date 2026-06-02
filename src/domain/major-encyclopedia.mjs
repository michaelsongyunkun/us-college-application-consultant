const FIELD_NAMES = {
  本科开设核验: "verification",
  复查说明: "reviewNote",
  专业介绍: "description",
  常见学习内容: "learningContent",
  就业方向: "careerPaths",
  专业强校: "strongSchools",
  录取难度: "admissionDifficulty",
  "建议申请检索名/口径": "searchName",
};

const CHOICE_KEYWORDS = {
  "计算机 / 数据": ["计算机", "数据", "编程", "算法", "AI", "机器学习", "软件", "数据库"],
  数学: ["数学", "统计", "概率", "建模", "量化", "精算"],
  工程: ["工程", "物理", "机械", "电子", "系统", "制造", "航空", "土木"],
  商科: ["商业", "管理", "金融", "会计", "市场", "创业", "运营"],
  社会科学: ["社会", "政策", "心理", "经济", "政治", "国际关系", "公共"],
  人文写作: ["文学", "历史", "哲学", "写作", "语言", "文化", "传媒"],
  生命健康: ["生物", "医学", "健康", "神经", "公共卫生", "护理", "营养"],
  艺术设计: ["艺术", "设计", "建筑", "音乐", "电影", "视觉", "创意"],
  编程建模: ["编程", "建模", "算法", "系统", "数据", "软件", "机器学习"],
  实验研究: ["实验", "研究", "科研", "实验室", "数据分析", "生物", "化学"],
  写作表达: ["写作", "表达", "政策", "传媒", "人文", "报告", "研究方法"],
  组织沟通: ["管理", "沟通", "领导", "组织", "咨询", "运营", "公共关系"],
  创意制作: ["设计", "创意", "作品", "视觉", "艺术", "媒体", "建筑"],
  社会服务: ["公共", "社会", "教育", "健康", "NGO", "社区", "政策"],
  技术作品: ["技术", "作品", "项目", "软件", "产品", "原型", "工程"],
  研究论文: ["研究", "论文", "数据", "实验", "文献", "分析"],
  商业方案: ["商业", "创业", "市场", "金融", "咨询", "运营"],
  公益影响: ["公益", "社会", "公共", "社区", "教育", "健康"],
  艺术作品集: ["作品集", "艺术", "设计", "视觉", "建筑", "音乐"],
  政策报告: ["政策", "报告", "公共", "社会", "经济", "国际关系"],
};

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.+#/ -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeFieldLabel(label) {
  return String(label || "")
    .replace(/\s+/g, "")
    .replace(/[：:]+$/u, "")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "major";
}

function splitMajorName(title) {
  const trimmed = String(title || "").trim();
  const hanIndex = [...trimmed].findIndex((char) => /\p{Script=Han}/u.test(char));
  if (hanIndex <= 0) {
    return {
      englishName: trimmed,
      chineseName: "",
    };
  }
  return {
    englishName: trimmed.slice(0, hanIndex).trim(),
    chineseName: trimmed.slice(hanIndex).trim(),
  };
}

function createMajor({ category, index, title }) {
  const { englishName, chineseName } = splitMajorName(title);
  return {
    id: `major-${String(index).padStart(3, "0")}-${slugify(englishName || title)}`,
    index: String(index).padStart(3, "0"),
    category,
    title: title.trim(),
    englishName,
    chineseName,
    verification: "",
    reviewNote: "",
    description: "",
    learningContent: "",
    careerPaths: "",
    strongSchools: "",
    admissionDifficulty: "",
    searchName: "",
  };
}

export function parseMajorsMarkdown(markdown) {
  const majors = [];
  let currentCategory = "";
  let current = null;

  function appendCurrent() {
    if (!current) return;
    majors.push(current);
    current = null;
  }

  for (const rawLine of String(markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const categoryHeading = line.match(/^##\s+(?!本版说明|逐条专业介绍)(.+)$/u);
    if (categoryHeading) {
      appendCurrent();
      currentCategory = categoryHeading[1].trim();
      continue;
    }

    const majorHeading = line.match(/^###\s+(\d+)[.、]\s+(.+)$/u);
    if (majorHeading) {
      appendCurrent();
      current = createMajor({
        category: currentCategory || "未分类专业",
        index: majorHeading[1],
        title: majorHeading[2],
      });
      continue;
    }

    const field = line.match(/^-\s+(.+?)[：:]\s*(.*)$/u);
    if (!field || !current) continue;
    const fieldName = FIELD_NAMES[normalizeFieldLabel(field[1])];
    if (fieldName) current[fieldName] = field[2].trim();
  }

  appendCurrent();
  return majors;
}

export function filterMajors(majors, { category = "", query = "" } = {}) {
  const normalizedQuery = normalizeText(query);
  return majors.filter((major) => {
    if (category && category !== "all" && major.category !== category) return false;
    if (!normalizedQuery) return true;
    return normalizeText(majorSearchableText(major)).includes(normalizedQuery)
      || normalizedQuery
        .split(" ")
        .filter((token) => token.length >= 2)
        .every((token) => normalizeText(majorSearchableText(major)).includes(token));
  });
}

export function getMajorCategories(majors) {
  return [...new Set(majors.map((major) => major.category).filter(Boolean))];
}

export function matchMajorsFromQuestionnaire(majors, answers = {}, { limit = 8 } = {}) {
  const weightedTerms = buildWeightedTerms(answers);
  const avoidTerms = extractFreeTextTerms(answers.avoid).map((term) => ({
    raw: term,
    normalized: normalizeText(term),
  }));

  return majors
    .map((major, index) => {
      const searchable = normalizeText(majorSearchableText(major));
      const careerText = normalizeText(major.careerPaths);
      const learningText = normalizeText(major.learningContent);
      const descriptionText = normalizeText(major.description);
      let score = 0;
      const reasonCandidates = [];

      for (const term of weightedTerms) {
        if (!term.normalized || !searchable.includes(term.normalized)) continue;
        const fieldWeight =
          careerText.includes(term.normalized) ? 2.2
            : learningText.includes(term.normalized) ? 1.8
              : descriptionText.includes(term.normalized) ? 1.4
                : 1;
        score += term.weight * fieldWeight;
        reasonCandidates.push(buildReason(term.raw, major, { careerText, learningText, descriptionText }));
      }

      for (const term of avoidTerms) {
        if (term.normalized && searchable.includes(term.normalized)) {
          score -= 3;
        }
      }

      if (score <= 0 && !weightedTerms.length) score = 0.1;

      return {
        major,
        score: Math.max(0, Math.round(score * 10) / 10),
        reasons: unique(reasonCandidates).slice(0, 4),
        index,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((result) => ({
      major: result.major,
      score: result.score,
      reasons: result.reasons.length ? result.reasons : fallbackReasons(result.major),
    }));
}

function buildReason(term, major, { careerText, learningText, descriptionText }) {
  const normalized = normalizeText(term);
  if (careerText.includes(normalized)) return `就业方向匹配“${term}”`;
  if (learningText.includes(normalized)) return `学习内容覆盖“${term}”`;
  if (descriptionText.includes(normalized)) return `专业介绍提到“${term}”`;
  return `${major.chineseName || major.englishName}与“${term}”相关`;
}

function fallbackReasons(major) {
  return [
    major.category ? `方向属于${major.category}` : "",
    major.admissionDifficulty ? `录取难度参考：${major.admissionDifficulty}` : "",
  ].filter(Boolean);
}

function buildWeightedTerms(answers) {
  const terms = [];
  for (const value of [answers.careerKeywords, answers.strengths, answers.fitNotes]) {
    for (const term of extractFreeTextTerms(value)) {
      terms.push({ raw: term, weight: 2 });
    }
  }
  for (const value of [
    ...(answers.subjects || []),
    ...(answers.workStyles || []),
    ...(answers.outputs || []),
  ]) {
    for (const keyword of CHOICE_KEYWORDS[value] || [value]) {
      terms.push({ raw: keyword, weight: 1.4 });
    }
  }
  return uniqueTerms(terms.map((term) => ({ ...term, normalized: normalizeText(term.raw) })));
}

function extractFreeTextTerms(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  const ascii = text.match(/[A-Za-z][A-Za-z0-9.+#-]*/g) || [];
  const cjk = text
    .split(/[，。；、,.!?！？\s/]+/u)
    .map((term) => term.trim())
    .filter((term) => /[\p{Script=Han}A-Za-z0-9]/u.test(term) && term.length >= 2);
  return unique([...cjk, ...ascii]).slice(0, 24);
}

function uniqueTerms(terms) {
  const byNormalized = new Map();
  for (const term of terms) {
    if (!term.normalized || term.normalized.length < 2) continue;
    const existing = byNormalized.get(term.normalized);
    if (!existing || term.weight > existing.weight) byNormalized.set(term.normalized, term);
  }
  return [...byNormalized.values()];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function majorSearchableText(major) {
  return [
    major.index,
    major.category,
    major.title,
    major.englishName,
    major.chineseName,
    major.verification,
    major.reviewNote,
    major.description,
    major.learningContent,
    major.careerPaths,
    major.strongSchools,
    major.admissionDifficulty,
    major.searchName,
  ].join(" ");
}
