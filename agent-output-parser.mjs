export function parseAgentOutput(markdown) {
  const source = String(markdown || "");
  const activities = parseTabularActivities(source);
  const plainTextActivities = activities.length ? [] : parsePlainTextActivities(source);

  return {
    activities: (activities.length
      ? activities
      : plainTextActivities.length
        ? plainTextActivities
        : parseNumberedActivities(source)
    ).slice(0, 10),
    narrative: extractNarrative(source),
  };
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
  return match ? match[1].trim() : "";
}

function normalizeId(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})(?:[.、)]|\s)*$/);
  return match ? match[1] : "";
}

function cleanCell(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["“”]+|["“”]+$/g, "")
    .trim();
}
