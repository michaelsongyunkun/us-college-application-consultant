const NUMBER_EVIDENCE_PATTERN = /[0-9０-９]+|百分之|第[一二三四五六七八九十]+|[一二三四五六七八九十百千万]+(名|个|项|次|人|小时|周|月|年|篇|场|份|组|%)/i;
const OUTCOME_TERMS = [
  "获",
  "奖",
  "入围",
  "发表",
  "完成",
  "提升",
  "降低",
  "服务",
  "影响",
  "播放",
  "用户",
  "人次",
  "论文",
  "项目",
  "成果",
  "star",
  "finalist",
  "award",
];
const IMPACT_TERMS = ["影响", "服务", "帮助", "带领", "组织", "社区", "学校", "成员", "受众", "用户", "传播", "公益", "工作坊"];
const LEADERSHIP_TERMS = ["创始", "发起", "主导", "负责人", "主席", "社长", "队长", "带领", "组织", "导师", "lead", "founder"];
const ACADEMIC_TERMS = ["学术", "研究", "科研", "论文", "竞赛", "实验", "数据", "模型", "算法", "工程", "物理", "数学", "计算机", "ap", "physics", "machine"];
const SERVICE_TERMS = ["公益", "志愿", "社区", "服务", "教学", "科普", "帮扶", "mentor", "workshop"];
const PROFILE_STOP_TERMS = new Set(["未定", "方向", "兴趣", "申请", "专业", "学生", "例如"]);

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function hasAnyTerm(text, terms) {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(term.toLowerCase()));
}

function countUsefulCharacters(value) {
  return [...String(value || "")].filter((char) => /[\p{Script=Han}A-Za-z0-9]/u.test(char)).length;
}

function activityText(activity) {
  return [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].join(" ");
}

function isFilledActivity(activity) {
  return Boolean(compactText(activityText(activity)));
}

function buildProfileTerms(profile = {}) {
  return [profile.majorDirection, profile.interests]
    .join(" ")
    .split(/[\s,，、/；;：:+\-]+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 2 && !PROFILE_STOP_TERMS.has(term));
}

function hasMajorFit(activity, profileTerms) {
  if (!profileTerms.length) return false;
  const text = normalizeText(activityText(activity));
  return profileTerms.some((term) => text.includes(term));
}

function duplicateNameCount(filledActivities) {
  const seen = new Set();
  let duplicates = 0;
  for (const activity of filledActivities) {
    const key = compactText(activity.activityName);
    if (!key) continue;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

function gradeCoverageCount(filledActivities) {
  const grades = new Set();
  for (const activity of filledActivities) {
    for (const match of String(activity.suggestedGrade || "").matchAll(/\b(9|10|11|12)\b/g)) {
      grades.add(match[1]);
    }
  }
  return grades.size;
}

function buildActivityNotes(filledActivities) {
  const duplicateNames = filledActivities
    .map((activity) => compactText(activity.activityName))
    .filter(Boolean)
    .filter((name, index, names) => names.indexOf(name) !== index);

  return filledActivities
    .map((activity) => {
      const text = activityText(activity);
      const notes = [];
      if (!compactText(activity.activityName)) notes.push("缺少清晰活动名称");
      if (!compactText(activity.executionDescription)) {
        notes.push("缺少具体执行描述");
      } else if (countUsefulCharacters(activity.executionDescription) < 35) {
        notes.push("描述偏短，建议补充问题、行动和结果");
      }
      if (!NUMBER_EVIDENCE_PATTERN.test(text)) notes.push("缺少数字或可核验证据");
      if (!hasAnyTerm(text, OUTCOME_TERMS) && !hasAnyTerm(text, IMPACT_TERMS)) notes.push("成果或影响不够明确");
      if (!compactText(activity.suggestedGrade)) notes.push("建议年级为空");
      if (duplicateNames.includes(compactText(activity.activityName))) notes.push("活动名称与其他条目重复");
      return notes.length ? { id: activity.id, name: activity.activityName || `第 ${activity.id} 项`, notes } : null;
    })
    .filter(Boolean)
    .slice(0, 6);
}

export function analyzeActivityQuality({ activities = [], profile = {} } = {}) {
  const filledActivities = activities.filter(isFilledActivity);
  const completedCount = filledActivities.length;
  const profileTerms = buildProfileTerms(profile);
  const metrics = {
    completedCount,
    structuredCount: filledActivities.filter(
      (activity) =>
        compactText(activity.type) &&
        compactText(activity.activityName) &&
        compactText(activity.executionDescription) &&
        compactText(activity.suggestedGrade),
    ).length,
    quantifiedCount: filledActivities.filter((activity) => NUMBER_EVIDENCE_PATTERN.test(activityText(activity))).length,
    outcomeCount: filledActivities.filter((activity) => hasAnyTerm(activityText(activity), OUTCOME_TERMS)).length,
    impactCount: filledActivities.filter((activity) => hasAnyTerm(activityText(activity), IMPACT_TERMS)).length,
    leadershipCount: filledActivities.filter((activity) => hasAnyTerm(activityText(activity), LEADERSHIP_TERMS)).length,
    academicCount: filledActivities.filter((activity) => hasAnyTerm(activityText(activity), ACADEMIC_TERMS)).length,
    serviceCount: filledActivities.filter((activity) => hasAnyTerm(activityText(activity), SERVICE_TERMS)).length,
    majorFitCount: filledActivities.filter((activity) => hasMajorFit(activity, profileTerms)).length,
    duplicateNameCount: duplicateNameCount(filledActivities),
    gradeCoverageCount: gradeCoverageCount(filledActivities),
  };

  if (!completedCount) {
    return {
      score: 0,
      statusLabel: "等待活动内容",
      summary: "填入活动后，系统会自动检查完整度、证据、影响和结构平衡。",
      metrics,
      strengths: [],
      issues: ["还没有可检查的活动内容。"],
      activityNotes: [],
    };
  }

  const score = Math.min(
    100,
    Math.round(
      Math.min(completedCount, 10) * 3 +
        (metrics.structuredCount / completedCount) * 20 +
        (metrics.quantifiedCount / completedCount) * 15 +
        (metrics.impactCount / completedCount) * 15 +
        Math.min(metrics.leadershipCount, 3) * 3 +
        Math.min(metrics.academicCount, 4) * 2 +
        Math.min(metrics.serviceCount, 2) * 3 +
        Math.min(metrics.majorFitCount, 4) * 1.5 +
        Math.min(metrics.gradeCoverageCount, 4) * 1.5 -
        metrics.duplicateNameCount * 6,
    ),
  );

  const issues = [];
  if (completedCount < 10) issues.push(`目前只有 ${completedCount}/10 项活动有内容，建议补齐 Common App 活动列表。`);
  if (metrics.quantifiedCount < Math.ceil(completedCount * 0.5)) issues.push("数字证据偏少，建议至少一半活动加入人数、排名、时长、成果规模或链接证据。");
  if (metrics.impactCount < Math.ceil(completedCount * 0.6)) issues.push("影响表达偏弱，建议更多说明服务对象、团队规模、传播范围或实际改变。");
  if (metrics.leadershipCount < 2 && completedCount >= 5) issues.push("领导力线索偏少，建议突出发起、主导、组织、带领或长期负责的经历。");
  if (profileTerms.length && metrics.majorFitCount < Math.max(2, Math.ceil(completedCount * 0.3))) issues.push("与目标专业或兴趣方向的连接还不够明显，可把部分活动改写到专业主线下。");
  if (metrics.serviceCount === 0 && completedCount >= 5) issues.push("缺少社区服务或外部影响类活动，申请叙事可能显得只关注个人成就。");
  if (metrics.duplicateNameCount > 0) issues.push("存在重复或高度相似的活动名称，建议合并或明确区分定位。");
  if (metrics.gradeCoverageCount <= 1 && completedCount >= 6) issues.push("活动年级分布较集中，建议呈现 9-12 年级的持续投入或进阶轨迹。");

  const strengths = [];
  if (completedCount === 10) strengths.push("10 项活动框架完整，已经具备完整列表基础。");
  if (metrics.quantifiedCount >= 5) strengths.push("多项活动包含数字证据，便于后续压缩成 Common App 描述。");
  if (metrics.leadershipCount >= 3) strengths.push("领导力表达较充分，能体现主动性和组织能力。");
  if (metrics.academicCount >= 3 && metrics.serviceCount >= 1) strengths.push("学术探索和外部影响都有呈现，叙事不会只停留在单一维度。");
  if (profileTerms.length && metrics.majorFitCount >= 3) strengths.push("多项活动与目标专业或兴趣方向形成连接，有利于塑造申请主线。");
  if (!strengths.length) strengths.push("已有活动素材可以继续打磨，下一步重点是补证据、补影响、补主线。");

  return {
    score: Math.max(0, score),
    statusLabel: score >= 80 ? "结构稳健" : score >= 60 ? "可继续打磨" : "需要补强",
    summary:
      score >= 80
        ? "当前活动列表的完整度和证据基础较好，下一步适合做精简表达和申请主线强化。"
        : score >= 60
          ? "当前活动列表已经有可用基础，但证据、影响或专业主线仍有提升空间。"
          : "当前活动列表还需要补充关键信息，建议先完善成果证据、影响对象和年级轨迹。",
    metrics,
    strengths,
    issues: issues.length ? issues.slice(0, 5) : ["暂无明显结构性问题，可继续打磨措辞和 Common App 字数。"],
    activityNotes: buildActivityNotes(filledActivities),
  };
}
