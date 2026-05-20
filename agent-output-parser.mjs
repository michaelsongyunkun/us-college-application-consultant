export function parseAgentOutput(markdown) {
  const activities = [];
  const lines = String(markdown || "").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    if (/^\|[-\s|:]+$/.test(trimmed)) continue;

    const cells = trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());

    if (cells.length < 5 || cells[0] === "序号") continue;
    if (!/^\d+$/.test(cells[0])) continue;

    activities.push({
      id: cells[0],
      type: cells[1],
      activityName: cells[2],
      executionDescription: cells[3],
      suggestedGrade: cells[4],
    });
  }

  const narrativeMarker = "### 【活动叙事逻辑解读】";
  const markerIndex = String(markdown || "").indexOf(narrativeMarker);
  const narrative =
    markerIndex >= 0
      ? String(markdown || "")
          .slice(markerIndex + narrativeMarker.length)
          .trim()
      : "";

  return {
    activities: activities.slice(0, 10),
    narrative,
  };
}
