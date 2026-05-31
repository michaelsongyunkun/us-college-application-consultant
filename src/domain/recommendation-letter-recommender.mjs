const STEM_TERMS = [
  "计算机",
  "人工智能",
  "ai",
  "cs",
  "data",
  "数据",
  "数学",
  "统计",
  "工程",
  "物理",
  "化学",
  "生物",
  "医学",
  "医",
  "机器人",
  "编程",
  "算法",
];

const HUMANITIES_ARTS_TERMS = [
  "历史",
  "政治",
  "社会",
  "心理",
  "传媒",
  "新闻",
  "写作",
  "文学",
  "哲学",
  "宗教",
  "人文",
  "社科",
  "艺术",
  "音乐",
  "设计",
  "戏剧",
  "电影",
  "经济",
  "商科",
  "金融",
  "法律",
  "教育",
];

const EXTERNAL_RESOURCE_TERMS = [
  "教授",
  "导师",
  "大学",
  "高校",
  "实验室",
  "科研",
  "论文",
  "发表",
  "实习",
  "医院",
  "公司",
  "机构",
  "ngo",
  "mentor",
  "professor",
  "research",
  "intern",
];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function hasAnyTerm(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function hasAnyProfileInput(profile) {
  return Object.values(profile || {}).some((value) => String(value ?? "").trim());
}

function hasPlanningOutput(activities) {
  return (activities || []).some((activity) =>
    [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].some((value) =>
      String(value ?? "").trim(),
    ),
  );
}

function directionType(profile) {
  const text = [profile?.majorDirection, profile?.interests].join(" ");
  const stemScore = STEM_TERMS.filter((term) => hasAnyTerm(text, [term])).length;
  const humanitiesScore = HUMANITIES_ARTS_TERMS.filter((term) => hasAnyTerm(text, [term])).length;
  if (stemScore > humanitiesScore) return "stem";
  if (humanitiesScore > stemScore) return "humanities_arts";
  return "mixed";
}

function summarizeActivities(activities) {
  const meaningful = (activities || [])
    .filter((activity) =>
      [activity.type, activity.activityName, activity.executionDescription].some((value) => String(value ?? "").trim()),
    )
    .slice(0, 3)
    .map((activity) => activity.activityName || activity.type)
    .filter(Boolean);

  return meaningful.length ? meaningful.join("、") : "规划表中的核心活动";
}

function findExternalResource(profile, activities, narrative) {
  const text = [
    profile?.availableResources,
    profile?.existingActivities,
    narrative,
    ...(activities || []).map((activity) => `${activity.activityName} ${activity.executionDescription}`),
  ].join(" ");
  return hasAnyTerm(text, EXTERNAL_RESOURCE_TERMS);
}

function majorTeacherSubject(profile) {
  const text = [profile?.majorDirection, profile?.interests].join(" ");
  if (hasAnyTerm(text, ["计算机", "ai", "人工智能", "cs", "编程", "算法", "数据"])) return "计算机 / 数学 / 科研相关教师";
  if (hasAnyTerm(text, ["数学", "统计"])) return "数学教师";
  if (hasAnyTerm(text, ["物理", "工程", "机器人"])) return "物理 / 工程相关教师";
  if (hasAnyTerm(text, ["化学", "生物", "医学", "健康"])) return "化学 / 生物相关教师";
  if (hasAnyTerm(text, ["经济", "商科", "金融"])) return "经济 / 商科相关教师";
  if (hasAnyTerm(text, ["历史", "政治", "社会", "法律", "传媒", "写作"])) return "历史 / 社科 / 英文写作相关教师";
  if (hasAnyTerm(text, ["艺术", "音乐", "设计", "戏剧", "电影"])) return "艺术 / 人文相关教师";
  return "最能证明申请方向能力的任课教师";
}

function complementaryTeacherSubject(type) {
  if (type === "stem") return "文社艺术科老师";
  if (type === "humanities_arts") return "STEM 类学科老师";
  return "与主申请方向形成互补的文理科老师";
}

export function buildRecommendationLetterStrategy({ profile, activities, narrative = "" }) {
  const hasProfile = hasAnyProfileInput(profile);
  const hasPlan = hasPlanningOutput(activities);

  if (!hasProfile || !hasPlan) {
    return {
      ready: false,
      items: [],
      notice: "补充背景和活动后生成。",
    };
  }

  const type = directionType(profile);
  const activityEvidence = summarizeActivities(activities);
  const externalRecommended = findExternalResource(profile, activities, narrative);
  const majorSubject = majorTeacherSubject(profile);
  const complementSubject = complementaryTeacherSubject(type);

  const items = [
    {
      role: "校内 Counselor 推荐信",
      recommenderType: "Counselor / 升学指导老师",
      priority: "必备",
      recommendationFocus: "负责统一呈现学生的课程选择、年级定位、校内成长轨迹和申请主线，帮助招生官理解学生整体背景。",
      evidence: `建议提前提供用户背景中的年级、目标方向、已有活动，以及规划表中的 ${activityEvidence} 等主线材料。`,
      preparationAdvice: "准备一页 brag sheet，突出长期成长、校内贡献、性格特质和规划表中的核心活动逻辑。",
    },
    {
      role: "申请专业方向教师推荐信",
      recommenderType: majorSubject,
      priority: "必备",
      recommendationFocus: "重点证明学生在目标专业方向上的课堂表现、学术潜力、问题意识和持续投入。",
      evidence: `推荐老师应能呼应规划表中的 ${activityEvidence}，并补充学生在课堂讨论、作业、项目或研究中的具体细节。`,
      preparationAdvice: "优先选择熟悉学生学术过程、能写出具体例子的老师，而不只看课程成绩高低。",
    },
    {
      role: "校内文理科互补推荐信",
      recommenderType: complementSubject,
      priority: "建议准备",
      recommendationFocus:
        type === "stem"
          ? "用于补充学生在人文表达、沟通协作、社会观察或艺术审美方面的证据，避免申请形象过于单一。"
          : type === "humanities_arts"
            ? "用于补充学生的定量能力、科学素养、逻辑推理或技术执行力，增强跨学科可信度。"
            : "用于证明学生不仅在主方向上有潜力，也具备跨学科适应力和稳定学习能力。",
      evidence: `建议结合规划表中的 ${activityEvidence}，选择能从另一类学科视角证明学生能力的老师。`,
      preparationAdvice: "给老师提供 2-3 个具体课堂或项目例子，让推荐信形成“主方向 + 互补能力”的结构。",
    },
  ];

  if (externalRecommended) {
    items.push({
      role: "校外推荐信",
      recommenderType: "专业方向高校教授 / 科研导师 / 项目导师",
      priority: "视学校政策选择提交",
      recommendationFocus: "用于证明学生在校外学术、科研、项目或社会实践中的真实投入和专业潜力。",
      evidence: `当前背景或规划中已经出现校外资源线索，可围绕 ${activityEvidence} 准备过程性材料和成果证据。`,
      preparationAdvice: "只有在导师能写出长期指导、具体贡献和成果质量时才建议提交；泛泛背书不建议占用推荐信名额。",
    });
  }

  return {
    ready: true,
    externalRecommended,
    items,
    notice: externalRecommended
      ? "建议准备 4 封推荐信：1 封 Counselor、2 封校内教师、1 封校外导师推荐信。"
      : "建议优先准备 3 封校内推荐信；当前规划中校外资源证据不足，暂不强推校外推荐信。",
  };
}
