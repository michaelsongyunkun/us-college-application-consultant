import { renderMarkdown } from "../domain/markdown-renderer.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const PROFILE_LABELS = {
  grade: "年级",
  majorDirection: "专业方向",
  schoolContext: "当前就读体系（项目资格筛选）",
  identityDescription: "美国身份条件（项目资格筛选）",
  coreStrengths: "核心能力 / 特长",
  availableResources: "可利用资源",
  personality: "性格 / 行为倾向",
  interests: "兴趣方向",
  existingActivities: "现有课外活动",
};

function profileLabel(key) {
  return PROFILE_LABELS[key] || key;
}

function buildCaseMatchSections(caseMatches) {
  if (!caseMatches?.length) {
    return `
    <h2>相似录取案例参考</h2>
    <p>当前案例库暂未找到合适案例，建议后续补充更多录取案例数据后再生成匹配结果。</p>`;
  }

  return `
    <h2>相似录取案例参考</h2>
    ${(caseMatches || [])
      .map(
        (match, index) => `
        <h3>案例 ${index + 1}</h3>
        <table>
          <tbody>
            <tr><th>录取院校</th><td>${escapeHtml(match.case?.admission)}</td></tr>
            <tr><th>专业方向</th><td>${escapeHtml(match.case?.major)}</td></tr>
            <tr><th>课程成绩</th><td>${escapeHtml(match.case?.academics)}</td></tr>
            <tr><th>奖项亮点</th><td>${escapeHtml(match.case?.awards)}</td></tr>
            <tr><th>活动亮点</th><td>${escapeHtml(match.case?.activities)}</td></tr>
            <tr><th>匹配理由</th><td>${escapeHtml(match.matchReason)}</td></tr>
            <tr><th>可借鉴点</th><td>${escapeHtml(match.takeaway)}</td></tr>
          </tbody>
        </table>`,
      )
      .join("")}`;
}

function buildCompetitionSections(competitionRecommendations) {
  if (!competitionRecommendations?.length) {
    return `
    <h2>国际竞赛推荐</h2>
    <p>当前竞赛库暂未找到合适竞赛，请补充竞赛资料后再生成推荐。</p>`;
  }

  return `
    <h2>国际竞赛推荐</h2>
    ${(competitionRecommendations || [])
      .map(
        (competition, index) => `
        <h3>推荐 ${index + 1}</h3>
        <table>
          <tbody>
            <tr><th>竞赛名称</th><td>${escapeHtml(competition.name)}</td></tr>
            <tr><th>竞赛类型</th><td>${escapeHtml(competition.recommendationType)}</td></tr>
            <tr><th>含金量评级</th><td>${escapeHtml(competition.rating || "B")}</td></tr>
            <tr><th>推荐理由</th><td>${escapeHtml(competition.recommendationReason)}</td></tr>
            <tr><th>对申请的帮助</th><td>${escapeHtml(competition.applicationHelp)}</td></tr>
            <tr><th>建议准备时间</th><td>${escapeHtml(competition.prepTime)}</td></tr>
            <tr><th>竞赛网址 / 官网链接</th><td>${escapeHtml(competition.url || "官网待确认")}</td></tr>
          </tbody>
        </table>`,
      )
      .join("")}`;
}

function buildSummerSchoolSections(summerSchoolRecommendations) {
  if (!summerSchoolRecommendations?.length) {
    return `
    <h2>夏校推荐</h2>
    <p>填写用户背景信息后，将根据学生方向生成夏校推荐。</p>`;
  }

  return `
    <h2>夏校推荐</h2>
    ${(summerSchoolRecommendations || [])
      .map(
        (school) => `
        <h3>${escapeHtml(school.tier)}：${escapeHtml(school.name)}</h3>
        <table>
          <tbody>
            <tr><th>夏校名称</th><td>${escapeHtml(school.name)}</td></tr>
            <tr><th>推荐定位</th><td>${escapeHtml(school.tier)}</td></tr>
            <tr><th>含金量评级</th><td>${escapeHtml(school.rating)}</td></tr>
            <tr><th>适配方向</th><td>${escapeHtml(school.category)}</td></tr>
            <tr><th>推荐理由</th><td>${escapeHtml(school.reason)}</td></tr>
            <tr><th>形式 & 官网</th><td>${escapeHtml(school.formatAndWebsite)}</td></tr>
            <tr><th>录取率</th><td>${escapeHtml(school.admissionRate)}</td></tr>
            <tr><th>申请要求</th><td>${escapeHtml((school.requirements || []).join("；"))}</td></tr>
            <tr><th>举办时间</th><td>${escapeHtml(school.programTime)}</td></tr>
            <tr><th>申请时间</th><td>${escapeHtml(school.applicationTime)}</td></tr>
          </tbody>
        </table>`,
      )
      .join("")}`;
}

function buildRecommendationLetterSections(recommendationLetterStrategy) {
  const items = recommendationLetterStrategy?.items || [];
  if (!items.length) {
    return `
    <h2>推荐信推荐</h2>
    <p>推荐信策略需要同时基于用户背景输入和规划回答输出表格生成。请先补充用户背景并生成或填写规划表格。</p>`;
  }

  return `
    <h2>推荐信推荐</h2>
    <p>${escapeHtml(recommendationLetterStrategy.notice || "")}</p>
    ${items
      .map(
        (letter, index) => `
        <h3>推荐信 ${index + 1}：${escapeHtml(letter.role)}</h3>
        <table>
          <tbody>
            <tr><th>推荐人类型</th><td>${escapeHtml(letter.recommenderType)}</td></tr>
            <tr><th>优先级</th><td>${escapeHtml(letter.priority)}</td></tr>
            <tr><th>推荐重点</th><td>${escapeHtml(letter.recommendationFocus)}</td></tr>
            <tr><th>可用证据</th><td>${escapeHtml(letter.evidence)}</td></tr>
            <tr><th>准备建议</th><td>${escapeHtml(letter.preparationAdvice)}</td></tr>
          </tbody>
        </table>`,
      )
      .join("")}`;
}

export function buildWordDocument({
  profile,
  activities,
  narrative,
  competitionRecommendations = [],
  summerSchoolRecommendations = [],
  recommendationLetterStrategy = { items: [] },
  caseMatches = [],
}) {
  const profileRows = Object.entries(profile || {})
    .map(([key, value]) => `<tr><th>${escapeHtml(profileLabel(key))}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  const activityRows = (activities || [])
    .map(
      (activity) => `
        <tr>
          <td>${escapeHtml(activity.id)}</td>
          <td>${escapeHtml(activity.type)}</td>
          <td>${escapeHtml(activity.activityName)}</td>
          <td>${renderMarkdown(activity.executionDescription) || ""}</td>
          <td>${escapeHtml(activity.suggestedGrade)}</td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>美本申请规划活动表</title>
    <style>
      body { font-family: "Microsoft YaHei", Arial, sans-serif; line-height: 1.5; }
      h1, h2 { color: #172033; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; }
      th, td { border: 1px solid #888; padding: 8px; vertical-align: top; }
      th { background: #eef5f7; }
    </style>
  </head>
  <body>
    <h1>美本申请规划活动表</h1>
    <h2>用户背景信息</h2>
    <table>
      <tbody>${profileRows}</tbody>
    </table>
    <h2>10项课外活动列表</h2>
    <table>
      <thead>
        <tr>
          <th>序号</th>
          <th>活动类型（Type）</th>
          <th>活动名称（精准描述）</th>
          <th>具体执行描述（需含：问题 / 成果 / 影响）</th>
          <th>建议年级</th>
        </tr>
      </thead>
      <tbody>${activityRows}</tbody>
    </table>
    <h2>活动叙事逻辑解读</h2>
    <p>${escapeHtml(narrative).replaceAll("\n", "<br>")}</p>
    ${buildCompetitionSections(competitionRecommendations)}
    ${buildSummerSchoolSections(summerSchoolRecommendations)}
    ${buildRecommendationLetterSections(recommendationLetterStrategy)}
    ${buildCaseMatchSections(caseMatches)}
  </body>
</html>`;
}

const APPLICATION_ROUND_EXPORT_LABELS = {
  rea: "REA",
  ed1: "ED1",
  ed2: "ED2",
  ea: "EA",
  uc: "UC",
  rd: "RD",
};

const ACTIVITY_EXPORT_COLUMNS = [
  ["活动名称", "activityName"],
  ["类型", "type"],
  ["时间阶段", "timeStage"],
  ["角色", "role"],
  ["具体内容", "description"],
  ["成果", "outcome"],
  ["证明材料", "proofLink"],
  ["状态", "status"],
];

const COMPETITION_EXPORT_COLUMNS = [
  ["竞赛名称", "competitionName"],
  ["学科方向", "subject"],
  ["参与年份/年级", "yearGrade"],
  ["奖项结果", "award"],
  ["个人贡献", "contribution"],
  ["证明材料", "proofLink"],
  ["状态", "status"],
];

const SUMMER_SCHOOL_EXPORT_COLUMNS = [
  ["项目名称", "programName"],
  ["主办方/学校", "organizer"],
  ["项目方向", "direction"],
  ["参与时间", "participationTime"],
  ["状态", "status"],
  ["项目产出", "output"],
  ["证明材料", "proofLink"],
];

export function buildApplicationPortfolioWordDocument({
  portfolio = {},
  exportedAt = new Date(),
} = {}) {
  const applicationRows = buildApplicationPlanRows(portfolio.applicationPlan);
  const recommendationRows = buildRecommendationLetterRows(portfolio.recommendationLetters || {});

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>我的申请</title>
    <style>
      body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #172033; line-height: 1.55; }
      h1, h2 { color: #172033; }
      h1 { margin-bottom: 6px; }
      .meta { color: #5f6f85; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 22px; }
      th, td { border: 1px solid #8d98a8; padding: 8px; vertical-align: top; }
      th { background: #eef5f7; color: #172033; }
      .empty { color: #6b7280; }
    </style>
  </head>
  <body>
    <h1>我的申请</h1>
    <p class="meta">导出时间：${escapeHtml(formatExportDate(exportedAt))}</p>
    ${buildExportTable("选校计划", ["申请轮次", "院校", "专业方向"], applicationRows, "暂无已填写的选校计划。")}
    ${buildRecordTable("课外活动", ACTIVITY_EXPORT_COLUMNS, portfolio.activities, "暂无已填写的课外活动。")}
    ${buildRecordTable("竞赛经历", COMPETITION_EXPORT_COLUMNS, portfolio.competitions, "暂无已填写的竞赛经历。")}
    ${buildRecordTable("夏校经历", SUMMER_SCHOOL_EXPORT_COLUMNS, portfolio.summerSchools, "暂无已填写的夏校经历。")}
    ${buildExportTable("推荐信准备", ["项目", "内容"], recommendationRows, "暂无已填写的推荐信准备信息。")}
  </body>
</html>`;
}

function buildApplicationPlanRows(plan = {}) {
  return Object.entries(APPLICATION_ROUND_EXPORT_LABELS).flatMap(([round, label]) =>
    (plan?.[round] || []).map((entry) => [
      label,
      entry.school || "",
      entry.major || "",
    ]),
  );
}

function buildRecommendationLetterRows(recommendationLetters = {}) {
  const rows = [];
  if (recommendationLetters.counselorStatus) {
    rows.push(["Counselor推荐信准备状态", recommendationLetters.counselorStatus]);
  }
  appendNestedRecommendationRows(rows, "校内教师1", recommendationLetters.teacher1);
  appendNestedRecommendationRows(rows, "校内教师2", recommendationLetters.teacher2);
  appendNestedRecommendationRows(rows, "校外推荐人", recommendationLetters.outsideRecommender);
  if (recommendationLetters.preparedMaterials?.length) {
    rows.push(["已准备材料", recommendationLetters.preparedMaterials.join("、")]);
  }
  if (recommendationLetters.notes) rows.push(["备注", recommendationLetters.notes]);
  return rows;
}

function appendNestedRecommendationRows(rows, label, value = {}) {
  const content = Object.values(value || {}).filter(Boolean).join("；");
  if (content) rows.push([label, content]);
}

function buildRecordTable(title, columns, records = [], emptyText) {
  const rows = (records || []).map((record) => columns.map(([, field]) => record[field] || ""));
  return buildExportTable(
    title,
    columns.map(([label]) => label),
    rows,
    emptyText,
  );
}

function buildExportTable(title, headers, rows, emptyText) {
  if (!rows?.length) {
    return `
    <h2>${escapeHtml(title)}</h2>
    <p class="empty">${escapeHtml(emptyText)}</p>`;
  }

  return `
    <h2>${escapeHtml(title)}</h2>
    <table>
      <thead>
        <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
        <tr>${row.map((cell) => `<td>${escapeHtml(cell).replaceAll("\n", "<br>")}</td>`).join("")}</tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function formatExportDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
