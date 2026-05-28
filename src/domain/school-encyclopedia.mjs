const FIELD_NAMES = {
  申请与文书: "applicationAndEssays",
  学校特色: "schoolFeatures",
  录取偏好: "admissionPreferences",
  推荐信要求: "recommendationRequirements",
};

const CATEGORY_LABELS = {
  university: "综合大学 T80",
  "liberal-arts": "文理学院 TOP50",
};

function englishSlug(name) {
  const token = String(name || "").match(/[A-Za-z][A-Za-z.'-]*/)?.[0] || "";
  return token.toLowerCase().replace(/[^a-z0-9]+/g, "") || "school";
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

export function parseSchoolsMarkdown(markdown) {
  const schools = [];
  const identifierCounts = new Map();
  let category = "";
  let current = null;

  function appendCurrent() {
    if (!current) return;
    const identifierBase = `${current.category}-${current.rank}-${englishSlug(current.name)}`;
    const identifierCount = (identifierCounts.get(identifierBase) || 0) + 1;
    identifierCounts.set(identifierBase, identifierCount);
    current.id = identifierCount === 1 ? identifierBase : `${identifierBase}-${identifierCount}`;
    schools.push(current);
    current = null;
  }

  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (/^##\s+综合性大学/.test(line)) {
      appendCurrent();
      category = "university";
      continue;
    }
    if (/^##\s+文理学院/.test(line)) {
      appendCurrent();
      category = "liberal-arts";
      continue;
    }

    const heading = line.match(/^####\s+#(\S+)\s+(.+?)\s*$/);
    if (heading && category) {
      appendCurrent();
      current = {
        id: "",
        category,
        categoryLabel: CATEGORY_LABELS[category],
        rank: heading[1],
        name: heading[2],
        applicationAndEssays: "",
        schoolFeatures: "",
        admissionPreferences: "",
        recommendationRequirements: "",
      };
      continue;
    }

    const field = line.match(/^-\s+\*\*(申请与文书|学校特色|录取偏好|推荐信要求)\*\*：\s*(.*)$/);
    if (field && current) {
      current[FIELD_NAMES[field[1]]] = field[2].trim();
    }
  }

  appendCurrent();
  return schools;
}

export function filterSchools(schools, { category, query = "" } = {}) {
  const normalizedQuery = normalizeText(query).trim();
  return schools.filter((school) => {
    if (category && school.category !== category) return false;
    if (!normalizedQuery) return true;
    return normalizeText(
      [
        school.rank,
        school.name,
        school.applicationAndEssays,
        school.schoolFeatures,
        school.admissionPreferences,
        school.recommendationRequirements,
      ].join(" "),
    ).includes(normalizedQuery);
  });
}
