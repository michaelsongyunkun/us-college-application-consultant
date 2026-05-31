function cleanValue(value) {
  return String(value ?? "").trim();
}

function splitList(value) {
  return cleanValue(value)
    .split(/[、,，/]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseCategoryHeading(line) {
  const match = cleanValue(line).match(/^##\s+(\d{2})\.\s+(.+?)（(.+?)）$/);
  if (!match) return null;
  return {
    categoryNumber: match[1],
    commonAppType: match[2].trim(),
    commonAppTypeCn: match[3].trim(),
  };
}

function parseActivityHeading(line) {
  const match = cleanValue(line).match(/^###\s+(\d{3})[｜|]([^｜|]+)[｜|](.+)$/);
  if (!match) return null;
  return {
    index: match[1],
    approach: match[2].trim(),
    name: match[3].trim(),
  };
}

function parseField(line) {
  const match = cleanValue(line).match(/^-\s+\*\*(活动内容|活动亮点|专业方向)\*\*[:：]\s*(.+)$/);
  if (!match) return null;
  return {
    label: match[1],
    value: match[2].trim(),
  };
}

export function parseExtracurricularActivitiesMarkdown(markdown) {
  const activities = [];
  let currentCategory = null;
  let categoryPositioning = "";
  let currentActivity = null;

  function addCurrentActivity() {
    if (!currentActivity || !currentCategory) return;
    activities.push({
      id: `extracurricular-activity-${currentCategory.categoryNumber}-${currentActivity.index}`,
      ...currentCategory,
      category: `${currentCategory.commonAppType}（${currentCategory.commonAppTypeCn}）`,
      categoryPositioning,
      ...currentActivity,
      majorDirections: splitList(currentActivity.majorDirectionText),
      raw: currentActivity.rawLines.join("\n").trim(),
    });
    currentActivity = null;
  }

  for (const line of String(markdown || "").replace(/\r\n/g, "\n").split("\n")) {
    const category = parseCategoryHeading(line);
    if (category) {
      addCurrentActivity();
      currentCategory = category;
      categoryPositioning = "";
      continue;
    }

    if (!currentCategory) continue;

    const positioning = cleanValue(line).match(/^>\s*类型定位[:：]\s*(.+)$/)?.[1];
    if (positioning) {
      categoryPositioning = positioning.trim();
      continue;
    }

    const heading = parseActivityHeading(line);
    if (heading) {
      addCurrentActivity();
      currentActivity = {
        ...heading,
        content: "",
        highlights: "",
        majorDirectionText: "",
        rawLines: [line],
      };
      continue;
    }

    if (!currentActivity) continue;
    if (cleanValue(line)) currentActivity.rawLines.push(line);

    const field = parseField(line);
    if (!field) continue;
    if (field.label === "活动内容") currentActivity.content = field.value;
    if (field.label === "活动亮点") currentActivity.highlights = field.value;
    if (field.label === "专业方向") currentActivity.majorDirectionText = field.value;
  }

  addCurrentActivity();
  return activities.filter((activity) => activity.name && activity.content);
}
