const DIRECTION_RULES = [
  {
    key: "ai_cs",
    terms: ["ai", "人工智能", "机器学习", "计算机", "编程", "python", "算法", "数据", "网站", "app"],
    focus: "Python 编程、数据分析、算法基础和 AI 工具应用",
    resources: "可系统学习 Python、统计入门、机器学习基础课程，并用小型数据项目做练习",
  },
  {
    key: "math",
    terms: ["数学", "建模", "aime", "amc", "微积分", "统计", "数论"],
    focus: "数学建模、证明写作、统计和微积分基础",
    resources: "建议补充竞赛数学专题、建模论文范例和英文数学表达训练",
  },
  {
    key: "business",
    terms: ["经济", "商科", "金融", "投资", "创业", "商业", "市场"],
    focus: "经济学原理、商业分析、财务基础和市场调研方法",
    resources: "可阅读经济学入门教材、公司案例和投资竞赛资料，并练习数据化商业报告",
  },
  {
    key: "humanities",
    terms: ["历史", "人文", "社科", "政治", "社会", "传媒", "写作", "辩论", "公共政策"],
    focus: "学术阅读、英文论文写作、访谈调研和公共表达",
    resources: "建议积累主题书单、学术数据库检索方法、Chicago/MLA 引用规范和长文写作样例",
  },
  {
    key: "science",
    terms: ["生物", "医学", "化学", "物理", "科研", "实验", "论文", "工程"],
    focus: "科研方法、实验设计、文献阅读和数据记录",
    resources: "可学习基础文献检索、实验安全、图表呈现和研究海报制作",
  },
  {
    key: "leadership",
    terms: ["社团", "公益", "志愿", "领导", "创办", "组织", "支教", "社区"],
    focus: "项目管理、志愿者组织、影响力评估和对外沟通",
    resources: "建议学习项目计划表、问卷设计、访谈记录、成果复盘和公众号/展示页写作",
  },
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function countChineseChars(text) {
  return [...String(text || "")].filter((char) => /[\p{Script=Han}A-Za-z0-9]/u.test(char)).length;
}

function truncateToMax(text, maxLength) {
  const chars = [...text];
  if (countChineseChars(text) <= maxLength) return text;
  return `${chars.slice(0, maxLength - 1).join("").replace(/[，、；。,.!?！？\s]+$/u, "")}。`;
}

function collectText({ profile, activities, narrative }) {
  const profileText = Object.values(profile || {}).join(" ");
  const activityText = (activities || [])
    .map((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].join(" "),
    )
    .join(" ");
  return [profileText, activityText, narrative].join(" ");
}

function pickDirections(text) {
  const normalized = normalizeText(text);
  const matched = DIRECTION_RULES.map((rule) => ({
    ...rule,
    score: rule.terms.reduce((total, term) => total + (normalized.includes(term.toLowerCase()) ? 1 : 0), 0),
  }))
    .filter((rule) => rule.score > 0)
    .sort((a, b) => b.score - a.score);

  return matched.length ? matched.slice(0, 3) : [DIRECTION_RULES[5], DIRECTION_RULES[3]];
}

export function buildFutureLearningDirection({ profile, activities, narrative }) {
  const text = collectText({ profile, activities, narrative });
  if (!text.trim()) return "";

  const directions = pickDirections(text);
  const focusText = directions.map((direction) => direction.focus).join("、");
  const resourceText = directions
    .slice(0, 2)
    .map((direction) => direction.resources)
    .join("；");

  const output = `未来学习方向建议围绕${focusText}展开。结合当前背景和已规划活动，学生下一阶段不只是参加活动，更需要补足能支撑活动落地的知识与方法：${resourceText}。同时建议建立学习档案，持续记录阅读笔记、项目日志、数据来源、阶段成果和反思复盘，方便后续把活动过程转化为申请材料中的证据。`;

  return truncateToMax(output, 250);
}

export function futureLearningLength(text) {
  return countChineseChars(text);
}
