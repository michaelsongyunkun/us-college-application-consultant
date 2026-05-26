function fieldValue(block, label) {
  return block.match(new RegExp(`^- \\*\\*${label}\\*\\*：(.+)$`, "m"))?.[1]?.trim() || "";
}

function websiteUrl(value) {
  return value.match(/\]\(([^)]+)\)/)?.[1]?.trim() || "";
}

export function parseResearchProjectsMarkdown(markdown) {
  const projects = [];
  let tier = "";
  let currentBlock = [];

  function addCurrentProject() {
    if (!currentBlock.length) return;
    const block = currentBlock.join("\n");
    const name = block.match(/^###\s+\d+\.\s+(.+)$/m)?.[1]?.trim();
    if (!name) return;
    projects.push({
      id: `research-project-${projects.length + 1}`,
      name,
      tier,
      rating: fieldValue(block, "含金量评级"),
      recommendation: fieldValue(block, "推荐度"),
      format: fieldValue(block, "项目形式"),
      duration: fieldValue(block, "周期"),
      cost: fieldValue(block, "费用"),
      mentorBackground: fieldValue(block, "导师背景"),
      description: fieldValue(block, "简介"),
      requirements: fieldValue(block, "报名条件"),
      suitableFor: fieldValue(block, "适合人群"),
      outputs: fieldValue(block, "产出"),
      website: websiteUrl(fieldValue(block, "官网")),
    });
  }

  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (/^##\s+/.test(line)) {
      addCurrentProject();
      currentBlock = [];
      tier = line.match(/^##\s+((?:A\+|A|B\+)\s*档)/)?.[1] || "";
      continue;
    }
    if (/^###\s+\d+\.\s+/.test(line)) {
      addCurrentProject();
      currentBlock = [line];
      continue;
    }
    if (currentBlock.length) currentBlock.push(line);
  }
  addCurrentProject();

  return projects;
}
