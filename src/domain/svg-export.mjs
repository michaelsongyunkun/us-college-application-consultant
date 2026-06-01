import { markdownToPlainText } from "./agent-output-parser.mjs";

const WIDTH = 1200;
const MARGIN = 52;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const BRAND_GREEN = "#287250";
const BRAND_ORANGE = "#a86400";
const INK = "#19233a";
const MUTED = "#637084";
const LINE = "#dce6df";
const SURFACE = "#ffffff";
const SURFACE_GREEN = "#edf5f0";
const SURFACE_WARM = "#fffaf0";

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

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeText(value, fallback = "暂无内容") {
  return markdownToPlainText(value).replace(/\s+/g, " ").trim() || fallback;
}

function profileLabel(key) {
  return PROFILE_LABELS[key] || key;
}

function characterWidthUnit(character) {
  if (/[\u4e00-\u9fff\u3040-\u30ff\uff00-\uffef]/u.test(character)) return 1;
  if (/[A-Z0-9]/.test(character)) return 0.66;
  if (/[a-z]/.test(character)) return 0.56;
  if (/\s/.test(character)) return 0.34;
  return 0.5;
}

function textWidthUnits(value) {
  return [...String(value || "")].reduce((width, character) => width + characterWidthUnit(character), 0);
}

function maxUnitsForWidth(width, fontSize, safety = 0.95) {
  return Math.max(8, Math.floor((width / fontSize) * safety));
}

function wrapText(value, maxUnits = 46) {
  const text = normalizeText(value, "");
  if (!text) return [];

  const lines = [];
  for (const paragraph of text.split(/\n+/)) {
    let current = "";
    for (const token of paragraph.split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(token)) {
        if (current && textWidthUnits(`${current} `) <= maxUnits) current += " ";
        continue;
      }

      if (textWidthUnits(token) > maxUnits) {
        if (current) {
          lines.push(current.trim());
          current = "";
        }
        for (const character of token) {
          if (current && textWidthUnits(current + character) > maxUnits) {
            lines.push(current.trim());
            current = character;
          } else {
            current += character;
          }
        }
        continue;
      }

      if (textWidthUnits(current + token) > maxUnits) {
        lines.push(current.trim());
        current = token;
      } else {
        current += token;
      }
    }
    if (current.trim()) lines.push(current.trim());
  }
  return lines.length ? lines : [text];
}

function buildText({ x, y, lines, size = 20, weight = 500, color = INK, lineHeight = size * 1.45 }) {
  const escapedLines = lines.map((line, index) => {
    const dy = index === 0 ? 0 : lineHeight;
    return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
  });

  return {
    markup: `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}">${escapedLines.join("")}</text>`,
    height: Math.max(lines.length, 1) * lineHeight,
  };
}

function createSvgLayout() {
  const elements = [];
  let y = 58;

  function rect(x, top, width, height, { fill = SURFACE, stroke = LINE, radius = 18 } = {}) {
    elements.push(
      `<rect x="${x}" y="${top}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" />`,
    );
  }

  function text(options) {
    const built = buildText(options);
    elements.push(built.markup);
    return built.height;
  }

  function addTitle(title, subtitle) {
    rect(MARGIN, y - 20, CONTENT_WIDTH, 132, { fill: SURFACE, stroke: "#d8e5df", radius: 24 });
    elements.push(`<circle cx="${MARGIN + 34}" cy="${y + 30}" r="23" fill="${SURFACE_GREEN}" />`);
    elements.push(`<path d="M${MARGIN + 34} ${y + 8} L${MARGIN + 52} ${y + 18} V${y + 40} C${MARGIN + 45} ${y + 52} ${MARGIN + 23} ${y + 52} ${MARGIN + 16} ${y + 40} V${y + 18} Z" fill="${BRAND_GREEN}" />`);
    elements.push(`<path d="M${MARGIN + 34} ${y + 17} L${MARGIN + 45} ${y + 24} V${y + 38} C${MARGIN + 40} ${y + 45} ${MARGIN + 28} ${y + 45} ${MARGIN + 23} ${y + 38} V${y + 24} Z" fill="#fffaf0" />`);
    elements.push(`<path d="M${MARGIN + 34} ${y + 23} L${MARGIN + 40} ${y + 36} H${MARGIN + 28} Z" fill="${BRAND_ORANGE}" />`);
    text({ x: MARGIN + 78, y: y + 22, lines: [title], size: 34, weight: 900 });
    text({ x: MARGIN + 78, y: y + 58, lines: [subtitle], size: 16, weight: 700, color: BRAND_GREEN });
    text({ x: WIDTH - 274, y: y + 58, lines: [`导出时间 ${new Date().toLocaleDateString("zh-CN")}`], size: 14, weight: 600, color: MUTED });
    y += 158;
  }

  function addSectionTitle(title, description = "") {
    text({ x: MARGIN, y, lines: [title], size: 25, weight: 900 });
    y += 10;
    if (description) {
      y += text({
        x: MARGIN,
        y: y + 22,
        lines: wrapText(description, maxUnitsForWidth(CONTENT_WIDTH, 15)),
        size: 15,
        weight: 500,
        color: MUTED,
        lineHeight: 22,
      });
    }
    y += 28;
  }

  function addProfile(profile) {
    const entries = Object.entries(profile || {}).filter(([, value]) => normalizeText(value, ""));
    addSectionTitle("用户背景信息", "用于理解学生当前阶段、方向、资源与项目资格边界。");
    if (!entries.length) {
      rect(MARGIN, y, CONTENT_WIDTH, 70, { fill: SURFACE, stroke: LINE, radius: 16 });
      text({ x: MARGIN + 24, y: y + 42, lines: ["暂未填写用户背景信息"], size: 17, color: MUTED });
      y += 96;
      return;
    }

    const columnWidth = (CONTENT_WIDTH - 18) / 2;
    let leftY = y;
    let rightY = y;
    entries.forEach(([key, value], index) => {
      const x = index % 2 === 0 ? MARGIN : MARGIN + columnWidth + 18;
      const top = index % 2 === 0 ? leftY : rightY;
      const valueLines = wrapText(value, maxUnitsForWidth(columnWidth - 36, 17));
      const height = 58 + valueLines.length * 21;
      rect(x, top, columnWidth, height, { fill: SURFACE, stroke: LINE, radius: 16 });
      text({ x: x + 18, y: top + 27, lines: [profileLabel(key)], size: 14, weight: 800, color: BRAND_GREEN });
      text({ x: x + 18, y: top + 56, lines: valueLines, size: 17, weight: 650, lineHeight: 23 });
      if (index % 2 === 0) leftY += height + 14;
      else rightY += height + 14;
    });
    y = Math.max(leftY, rightY) + 16;
  }

  function addActivities(activities) {
    addSectionTitle("15项课外活动规划", "活动名称与具体执行描述已转为可视化文本，可直接给学生和家长复盘。");
    const filledActivities = (activities || []).filter((activity) =>
      [activity.type, activity.activityName, activity.executionDescription, activity.suggestedGrade].some((value) =>
        normalizeText(value, ""),
      ),
    );

    if (!filledActivities.length) {
      rect(MARGIN, y, CONTENT_WIDTH, 78, { fill: SURFACE, stroke: LINE, radius: 18 });
      text({ x: MARGIN + 24, y: y + 46, lines: ["暂未填写活动规划表格"], size: 17, color: MUTED });
      y += 104;
      return;
    }

    filledActivities.forEach((activity, index) => {
      const activityTextWidth = CONTENT_WIDTH - 144;
      const titleLines = wrapText(activity.activityName || `活动 ${index + 1}`, maxUnitsForWidth(activityTextWidth, 22));
      const descriptionLines = wrapText(
        activity.executionDescription || "暂无具体执行描述",
        maxUnitsForWidth(activityTextWidth, 16),
      );
      const cardHeight = 120 + titleLines.length * 25 + descriptionLines.length * 23;
      rect(MARGIN, y, CONTENT_WIDTH, cardHeight, {
        fill: index % 2 === 0 ? SURFACE : "#fdfcf8",
        stroke: LINE,
        radius: 20,
      });
      elements.push(`<circle cx="${MARGIN + 36}" cy="${y + 42}" r="18" fill="${BRAND_GREEN}" />`);
      text({ x: MARGIN + 29, y: y + 49, lines: [String(activity.id || index + 1)], size: 18, weight: 900, color: "#ffffff" });
      text({ x: MARGIN + 72, y: y + 34, lines: [normalizeText(activity.type, "活动类型待定")], size: 15, weight: 850, color: BRAND_GREEN });
      text({ x: WIDTH - 204, y: y + 34, lines: [`建议年级 ${normalizeText(activity.suggestedGrade, "待定")}`], size: 15, weight: 700, color: MUTED });
      let cursor = y + 67;
      cursor += text({ x: MARGIN + 72, y: cursor, lines: titleLines, size: 22, weight: 900, lineHeight: 29 });
      text({ x: MARGIN + 72, y: cursor + 18, lines: descriptionLines, size: 16, weight: 500, color: INK, lineHeight: 23 });
      y += cardHeight + 18;
    });
    y += 8;
  }

  function addNarrative(narrative) {
    addSectionTitle("活动叙事", "申请主线参考。");
    const lines = wrapText(narrative || "暂未生成活动叙事逻辑。", maxUnitsForWidth(CONTENT_WIDTH - 48, 17));
    const height = 62 + lines.length * 23;
    rect(MARGIN, y, CONTENT_WIDTH, height, { fill: SURFACE_GREEN, stroke: "#c9dfd2", radius: 20 });
    text({ x: MARGIN + 24, y: y + 40, lines, size: 17, weight: 550, color: INK, lineHeight: 24 });
    y += height + 28;
  }

  function addListSection(title, items, getLines, emptyText) {
    addSectionTitle(title);
    if (!items?.length) {
      rect(MARGIN, y, CONTENT_WIDTH, 70, { fill: SURFACE, stroke: LINE, radius: 16 });
      text({ x: MARGIN + 24, y: y + 42, lines: [emptyText], size: 16, color: MUTED });
      y += 94;
      return;
    }

    items.forEach((item, index) => {
      const bodyUnits = maxUnitsForWidth(CONTENT_WIDTH - 48, 15);
      const lines = getLines(item, index).flatMap((line) => wrapText(line, bodyUnits));
      const height = 52 + lines.length * 22;
      rect(MARGIN, y, CONTENT_WIDTH, height, { fill: SURFACE, stroke: LINE, radius: 18 });
      text({ x: MARGIN + 24, y: y + 34, lines: [`${index + 1}. ${lines[0] || "推荐项"}`], size: 18, weight: 850 });
      if (lines.length > 1) {
        text({ x: MARGIN + 24, y: y + 64, lines: lines.slice(1), size: 15, weight: 500, color: MUTED, lineHeight: 22 });
      }
      y += height + 14;
    });
    y += 10;
  }

  function addFooter() {
    const footerY = y + 12;
    text({
      x: MARGIN,
      y: footerY,
      lines: ["AI 生成内容用于规划参考，项目资格、院校政策和申请材料仍需人工核验。"],
      size: 14,
      weight: 600,
      color: MUTED,
    });
    y += 58;
  }

  function output() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${Math.ceil(y)}" viewBox="0 0 ${WIDTH} ${Math.ceil(y)}" role="img" aria-label="美本申请规划报告">
  <rect width="100%" height="100%" fill="#fbfaf5" />
  <style>
    text { font-family: "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif; }
  </style>
  ${elements.join("\n  ")}
</svg>`;
  }

  return {
    addTitle,
    addProfile,
    addActivities,
    addNarrative,
    addListSection,
    addFooter,
    output,
  };
}

export function buildSvgDocument({
  profile,
  activities,
  narrative,
  competitionRecommendations = [],
  summerSchoolRecommendations = [],
  recommendationLetterStrategy = { items: [] },
  caseMatches = [],
}) {
  const layout = createSvgLayout();
  layout.addTitle("美本申请规划报告", "US College Compass · Application Planning Center");
  layout.addProfile(profile);
  layout.addActivities(activities);
  layout.addNarrative(narrative);
  layout.addListSection(
    "国际竞赛推荐",
    competitionRecommendations,
    (competition) => [
      `${normalizeText(competition.name, "竞赛名称待定")}（${normalizeText(competition.rating || "B", "评级待定")}）`,
      `推荐理由：${normalizeText(competition.recommendationReason, "暂无推荐理由")}`,
      `申请帮助：${normalizeText(competition.applicationHelp, "暂无申请帮助说明")}`,
      `准备时间：${normalizeText(competition.prepTime, "待定")}；官网：${normalizeText(competition.url, "官网待确认")}`,
    ],
    "竞赛库暂无匹配项。",
  );
  layout.addListSection(
    "夏校推荐",
    summerSchoolRecommendations,
    (school) => [
      `${normalizeText(school.tier, "推荐定位待定")}：${normalizeText(school.name, "夏校名称待定")}`,
      `适配方向：${normalizeText(school.category, "待定")}；含金量：${normalizeText(school.rating, "待定")}`,
      `推荐理由：${normalizeText(school.reason, "暂无推荐理由")}`,
      `形式与官网：${normalizeText(school.formatAndWebsite, "待确认")}`,
    ],
    "填写用户背景信息后，将根据学生方向生成夏校推荐。",
  );
  layout.addListSection(
    "推荐信策略",
    recommendationLetterStrategy?.items || [],
    (letter) => [
      `${normalizeText(letter.role, "推荐信")}：${normalizeText(letter.recommenderType, "推荐人类型待定")}`,
      `优先级：${normalizeText(letter.priority, "待定")}；推荐重点：${normalizeText(letter.recommendationFocus, "待定")}`,
      `可用证据：${normalizeText(letter.evidence, "暂无证据")}`,
      `准备建议：${normalizeText(letter.preparationAdvice, "暂无准备建议")}`,
    ],
    "补充背景和活动后生成。",
  );
  layout.addListSection(
    "相似录取案例参考",
    caseMatches,
    (match) => [
      `${normalizeText(match.case?.admission, "录取院校待定")} · ${normalizeText(match.case?.major, "专业方向待定")}`,
      `匹配理由：${normalizeText(match.matchReason, "暂无匹配理由")}`,
      `可借鉴点：${normalizeText(match.takeaway, "暂无可借鉴点")}`,
    ],
    "案例库暂无匹配项。",
  );
  layout.addFooter();
  return layout.output();
}
