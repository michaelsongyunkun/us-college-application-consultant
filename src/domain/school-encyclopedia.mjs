const FIELD_NAMES = {
  中国学生录取友好度: "chinaApplicantFriendliness",
  申请与文书: "applicationAndEssays",
  学校特色: "schoolFeatures",
  地理位置: "location",
  安全评分: "safetyScore",
  录取偏好: "admissionPreferences",
  推荐信要求: "recommendationRequirements",
  标化政策: "standardizedTesting",
};

const CATEGORY_LABELS = {
  university: "综合大学 T80",
  "liberal-arts": "文理学院 TOP50",
  international: "英港澳加新院校",
  "other-region": "其他地区院校",
};

const INTERNATIONAL_FIELD_NAMES = {
  官网: "website",
  地区: "region",
  地理位置: "location",
  "QS 2026": "qsRanking",
  "THE 2026": "theRanking",
  "ARWU 2025": "arwuRanking",
  "U.S. News 2025-2026": "usNewsRanking",
  平均排名: "averageRanking",
  "年预算人民币/年": "budgetRmb",
  "估算对应本币/年": "localBudget",
  预算备注: "budgetNote",
  本科申请学术要求: "applicationRequirement",
  "AL（GCE/International A-Level）": "aLevelRequirement",
  "AP / 美高": "apRequirement",
  IB: "ibRequirement",
  英语要求: "englishRequirement",
  语言要求: "englishRequirement",
  热门专业: "popularMajors",
  学校风格: "schoolStyle",
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
  let internationalRegion = "";
  let internationalRank = 0;
  let current = null;

  function appendCurrent() {
    if (!current) return;
    if (current.category === "international" || current.category === "other-region") {
      current.region = current.region || internationalRegion;
      current.applicationAndEssays = current.applicationRequirement;
      current.schoolFeatures = current.schoolStyle;
      current.admissionPreferences = current.popularMajors;
      current.recommendationRequirements = [current.website, current.budgetNote].filter(Boolean).join("；");
    }
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
    const internationalSection = line.match(/^###\s+\d+\.\d+\s+(.+?)院校\s*$/);
    if (internationalSection) {
      appendCurrent();
      internationalRegion = internationalSection[1].trim();
      category = internationalRegion === "其他地区" ? "other-region" : "international";
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
        chinaApplicantFriendliness: "",
        applicationAndEssays: "",
        schoolFeatures: "",
        location: "",
        safetyScore: "",
        admissionPreferences: "",
        recommendationRequirements: "",
        standardizedTesting: "",
      };
      continue;
    }
    const internationalHeading = line.match(/^####\s+(.+?)\s*$/);
    if (internationalHeading && (category === "international" || category === "other-region")) {
      appendCurrent();
      internationalRank += 1;
      current = {
        id: "",
        category,
        categoryLabel: CATEGORY_LABELS[category],
        rank: String(internationalRank),
        name: internationalHeading[1],
        region: internationalRegion,
        location: "",
        website: "",
        qsRanking: "",
        theRanking: "",
        arwuRanking: "",
        usNewsRanking: "",
        averageRanking: "",
        budgetRmb: "",
        localBudget: "",
        budgetNote: "",
        applicationRequirement: "",
        aLevelRequirement: "",
        apRequirement: "",
        ibRequirement: "",
        englishRequirement: "",
        popularMajors: "",
        schoolStyle: "",
        applicationAndEssays: "",
        schoolFeatures: "",
        admissionPreferences: "",
        recommendationRequirements: "",
      };
      continue;
    }

    const field = line.match(/^-\s+\*\*(中国学生录取友好度|申请与文书|学校特色|地理位置|安全评分|录取偏好|推荐信要求|标化政策)\*\*：\s*(.*)$/);
    if (field && current) {
      current[FIELD_NAMES[field[1]]] = field[2].trim();
      continue;
    }

    const internationalField = line.match(/^-\s+(.+?)：\s*(.*)$/);
    if (internationalField && (current?.category === "international" || current?.category === "other-region")) {
      const fieldName = INTERNATIONAL_FIELD_NAMES[internationalField[1].trim()];
      if (fieldName) current[fieldName] = internationalField[2].trim();
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
        school.chinaApplicantFriendliness,
        school.applicationAndEssays,
        school.schoolFeatures,
        school.safetyScore,
        school.admissionPreferences,
        school.recommendationRequirements,
        school.standardizedTesting,
        school.region,
        school.location,
        school.website,
        school.qsRanking,
        school.theRanking,
        school.arwuRanking,
        school.usNewsRanking,
        school.averageRanking,
        school.budgetRmb,
        school.localBudget,
        school.budgetNote,
        school.applicationRequirement,
        school.aLevelRequirement,
        school.apRequirement,
        school.ibRequirement,
        school.englishRequirement,
        school.popularMajors,
        school.schoolStyle,
      ].join(" "),
    ).includes(normalizedQuery);
  });
}
