export const PLANNING_ACTIVITY_COUNT = 15;

export function parseAgentOutput(markdown) {
  const source = String(markdown || "");
  const activities = parseTabularActivities(source);
  const plainTextActivities = activities.length ? [] : parsePlainTextActivities(source);
  const numberedActivities = activities.length || plainTextActivities.length ? [] : parseNumberedActivities(source);
  const selectedActivities = (activities.length
    ? activities
    : plainTextActivities.length
      ? plainTextActivities
      : numberedActivities
  ).slice(0, PLANNING_ACTIVITY_COUNT);
  const narrative = extractNarrative(source);

  return {
    activities: selectedActivities,
    narrative,
    diagnostics: buildParseDiagnostics({
      source,
      activities: selectedActivities,
      tabularActivities: activities,
      plainTextActivities,
      numberedActivities,
      narrative,
    }),
  };
}

export function diagnoseAgentOutput(markdown) {
  return parseAgentOutput(markdown).diagnostics;
}

function parseTabularActivities(source) {
  const activities = [];

  for (const line of source.split(/\r?\n/)) {
    const activity = buildActivityFromCells(parseRowCells(line));
    if (activity) activities.push(activity);
  }

  return activities;
}

function parseRowCells(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (/^\|?[-\s|:]+\|?$/.test(trimmed)) return [];

  if (trimmed.includes("\t")) {
    return trimmed.split("\t").map(cleanCell);
  }

  if (!trimmed.includes("|")) return [];

  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cleanCell);
}

function buildActivityFromCells(cells) {
  if (cells.length < 5) return null;
  const id = normalizeId(cells[0]);
  if (!id) return null;

  const type = cells[1];
  const activityName = cells[2];
  const suggestedGrade = cells.at(-1);
  const executionDescription = cells.slice(3, -1).join(" | ");
  if (![type, activityName, executionDescription, suggestedGrade].some(Boolean)) return null;

  return {
    id,
    type,
    activityName,
    executionDescription,
    suggestedGrade,
  };
}

function parseNumberedActivities(source) {
  const activities = [];
  const beforeNarrative = source.split(/^\s*#{0,4}\s*【?活动叙事逻辑解读】?/m)[0];
  const blockPattern =
    /(?:^|\n)\s*(?:序号\s*[:：]\s*)?(\d{1,2})[.、)]?\s+([\s\S]*?)(?=\n\s*(?:序号\s*[:：]\s*)?\d{1,2}[.、)]?\s+|\n\s*#{0,4}\s*【?活动叙事逻辑解读】?|$)/g;

  for (const match of beforeNarrative.matchAll(blockPattern)) {
    const activity = buildActivityFromNumberedBlock(match[1], match[2]);
    if (activity) activities.push(activity);
  }

  return activities;
}

function parsePlainTextActivities(source) {
  const activities = [];

  for (const line of source.split(/\r?\n/)) {
    const activity = parsePlainTextActivityLine(line);
    if (activity) activities.push(activity);
  }

  return activities;
}

function parsePlainTextActivityLine(line) {
  const trimmed = line.trim();
  if (!trimmed || /^(序号|活动类型|以下是|---|【?活动叙事逻辑解读】?)/.test(trimmed)) return null;

  const startMatch = trimmed.match(/^(\d{1,2})\s+([^\s]+)\s+(.+)$/);
  if (!startMatch) return null;

  const [, rawId, type, rest] = startMatch;
  const gradeMatch = rest.match(
    /\s((?:(?:9|10|11|12)(?:-(?:9|10|11|12))?(?:年级)?(?:暑假|寒假)?|\d{1,2}\+)(?:\s*[,，、]\s*(?:(?:9|10|11|12)(?:-(?:9|10|11|12))?(?:年级)?(?:暑假|寒假)?|\d{1,2}\+))*|(?:9|10|11|12)年级(?:暑假|寒假))$/,
  );
  if (!gradeMatch) return null;

  const suggestedGrade = gradeMatch[1].trim();
  const content = rest.slice(0, gradeMatch.index).trim();
  const splitIndex = findDescriptionStart(content);
  if (splitIndex <= 0) return null;

  const activityName = content.slice(0, splitIndex).trim();
  const executionDescription = content.slice(splitIndex).trim();
  if (!activityName || !executionDescription) return null;

  return {
    id: normalizeId(rawId),
    type,
    activityName,
    executionDescription,
    suggestedGrade,
  };
}

function findDescriptionStart(content) {
  const marker = content.match(
    /\s(?=(?:9|10|11|12)(?:-(?:9|10|11|12))?年级(?:暑假|寒假)?(?:长期兴趣|主导研究|发起|持续挑战|个人项目)?[：:]|(?:为解决|针对|不满足于|响应|在自学|通过严格选拔|为锻炼|利用|发现|创建|设计|从))/,
  );
  if (marker) return marker.index + marker[0].length;

  const sentenceStart = content.search(/[。；]\s*/);
  return sentenceStart > 0 ? sentenceStart + 1 : -1;
}

function buildActivityFromNumberedBlock(rawId, block) {
  const values = {
    type: "",
    activityName: "",
    executionDescription: "",
    suggestedGrade: "",
  };

  for (const line of block.split(/\r?\n/)) {
    const parsed = parseLabeledLine(line);
    if (parsed) values[parsed.key] = parsed.value;
  }

  if (!values.type || !values.activityName || !values.executionDescription || !values.suggestedGrade) {
    return buildActivityFromCells(parseRowCells(`${rawId} | ${block}`));
  }

  return {
    id: normalizeId(rawId),
    ...values,
  };
}

function parseLabeledLine(line) {
  const cleaned = cleanCell(line).replace(/^[-*]\s*/, "");
  const match = cleaned.match(
    /^\*{0,2}\s*(活动类型(?:（Type）|\(Type\))?|类型|Activity Type|活动名称(?:（精准描述）|\(精准描述\))?|名称|Activity Name|具体执行描述(?:（[^）]*）|\([^)]*\))?|执行描述|描述|建议年级|年级|Suggested Grade)\s*\*{0,2}\s*[:：]\s*(.+)$/i,
  );
  if (!match) return null;

  const label = match[1];
  const value = cleanCell(match[2]);
  if (/活动类型|类型|Activity Type/i.test(label)) return { key: "type", value };
  if (/活动名称|名称|Activity Name/i.test(label)) return { key: "activityName", value };
  if (/具体执行描述|执行描述|描述/i.test(label)) return { key: "executionDescription", value };
  if (/建议年级|年级|Suggested Grade/i.test(label)) return { key: "suggestedGrade", value };
  return null;
}

function extractNarrative(source) {
  const match = source.match(/^\s*#{0,4}\s*【?活动叙事逻辑解读】?\s*[:：]?\s*([\s\S]*)$/m);
  return match ? markdownToPlainText(match[1]) : "";
}

function buildParseDiagnostics({ source, activities, tabularActivities, plainTextActivities, numberedActivities, narrative }) {
  const nonEmptyLineCount = source.split(/\r?\n/).filter((line) => line.trim()).length;
  const hasTableHeader = /序号[\s\S]{0,30}活动类型[\s\S]{0,30}活动名称[\s\S]{0,40}建议年级/.test(source);
  const candidatePipeRows = source
    .split(/\r?\n/)
    .filter((line) => parseRowCells(line).length >= 5).length;
  const candidateNumberedBlocks = [...source.matchAll(/(?:^|\n)\s*(?:序号\s*[:：]\s*)?\d{1,2}[.、)]?\s+/g)].length;
  const candidatePlainTextRows = source
    .split(/\r?\n/)
    .filter((line) => /^\s*\d{1,2}\s+\S+\s+/.test(line)).length;
  const strategy = tabularActivities.length
    ? "table"
    : plainTextActivities.length
      ? "plain-text-table"
      : numberedActivities.length
        ? "numbered-blocks"
        : "none";
  const issues = [];
  const suggestions = [];

  if (!source.trim()) {
    issues.push("粘贴区为空。");
    suggestions.push("请粘贴 AI 生成的完整回答，而不只是活动叙事解读或局部段落。");
  }
  if (!activities.length && source.trim()) {
    issues.push("没有识别到可填入表格的活动行。");
    suggestions.push("建议让 AI 使用包含 5 列的表格：序号、活动类型、活动名称、具体执行描述、建议年级。");
  }
  if (hasTableHeader && !candidatePipeRows && !activities.length) {
    issues.push("检测到表头，但没有检测到完整表格行。");
    suggestions.push("复制时请从第 1 项活动开始一起复制，或保留每行之间的换行/制表符。");
  }
  if (candidateNumberedBlocks > 0 && !activities.length) {
    issues.push(`检测到 ${candidateNumberedBlocks} 个疑似编号段落，但缺少稳定字段标签。`);
    suggestions.push("每项活动请尽量写出：活动类型、活动名称、具体执行描述、建议年级。");
  }
  if (activities.length > 0 && activities.length < PLANNING_ACTIVITY_COUNT) {
    issues.push(`已识别 ${activities.length} 项活动，但少于规划输出 ${PLANNING_ACTIVITY_COUNT} 项完整列表。`);
    suggestions.push(`如果需要完整规划，请让 AI 补齐到 ${PLANNING_ACTIVITY_COUNT} 项，或检查是否有部分行被复制漏掉。`);
  }
  if (!narrative) {
    issues.push("未识别到【活动叙事逻辑解读】。");
    suggestions.push("建议保留 AI 回答末尾的【活动叙事逻辑解读】，便于生成后续推荐和报告。");
  }

  return {
    activityCount: activities.length,
    narrativeFound: Boolean(narrative),
    strategy,
    nonEmptyLineCount,
    evidence: {
      hasTableHeader,
      candidatePipeRows,
      candidatePlainTextRows,
      candidateNumberedBlocks,
      recognizedTableRows: tabularActivities.length,
      recognizedPlainTextRows: plainTextActivities.length,
      recognizedNumberedRows: numberedActivities.length,
    },
    issues,
    suggestions: [...new Set(suggestions)].slice(0, 4),
  };
}

function normalizeId(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?:[.、)]|\s)*$/);
  return match ? match[1] : "";
}

function cleanCell(value) {
  const unquoted = String(value ?? "")
    .trim()
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();
  return markdownToPlainText(unquoted);
}

export function markdownToPlainText(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s*/, "")
        .replace(/^[-*+]\s+/, "")
        .replace(/^\d+[.)]\s+/, ""),
    )
    .join("\n")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
