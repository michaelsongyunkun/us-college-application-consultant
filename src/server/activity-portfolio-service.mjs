const ACTIVITY_LIMIT = 10;
const COMPETITION_LIMIT = 5;
const SUMMER_SCHOOL_LIMIT = 3;
const PLANNING_ACTION_LIMIT = 20;
const DEEPSEEK_NOTE_LIMIT = 20;
const SCHOOL_SELECTION_VERSION_LIMIT = 12;
const GPA_RECORD_LIMIT = 16;
const SAT_TEST_LIMIT = 10;
const AP_EXAM_LIMIT = 40;
const STANDARDIZED_PLAN_ARRAY_LIMIT = 80;
const STANDARDIZED_PLAN_OBJECT_FIELD_LIMIT = 120;
const STANDARDIZED_PLAN_MAX_DEPTH = 7;
const APPLICATION_ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "uc", "rd", "multiCountry"];
const APPLICATION_ROUND_LIMITS = {
  rea: 1,
  ed1: 1,
  ed2: 1,
  ea: 50,
  uc: 20,
  rd: 50,
  multiCountry: 50,
};

const ACTIVITY_FIELDS = [
  "activityName",
  "type",
  "timeStage",
  "role",
  "description",
  "outcome",
  "proofLink",
  "status",
];
const COMPETITION_FIELDS = [
  "competitionName",
  "subject",
  "yearGrade",
  "award",
  "contribution",
  "proofLink",
  "status",
];
const SUMMER_SCHOOL_FIELDS = [
  "programName",
  "organizer",
  "direction",
  "participationTime",
  "status",
  "output",
  "proofLink",
];
const PLANNING_ACTION_FIELDS = ["text", "source"];
const DEEPSEEK_NOTE_FIELDS = ["title", "content", "source"];
const SCHOOL_SELECTION_VERSION_FIELDS = ["versionName", "summary", "selectionJson", "source"];
const APPLICATION_PLAN_FIELDS = ["school", "major"];
const GPA_RECORD_FIELDS = ["gradeLevel", "term", "gpa"];
const SAT_TEST_FIELDS = ["totalScore", "englishScore", "mathScore", "testDate"];
const AP_EXAM_FIELDS = ["courseName", "score", "examYear"];
const GPA_SCALE_OPTIONS = new Set(["4.0分制", "100分制", "4.3分制", "5分制"]);
const AP_SCORE_OPTIONS = new Set(["1", "2", "3", "4", "5", "未出分"]);
const DEFAULT_GPA_RECORDS = Object.freeze(
  ["9年级", "10年级", "11年级", "12年级"].flatMap((gradeLevel) =>
    ["上学期", "下学期"].map((term) => ({ gradeLevel, term, gpa: "" })),
  ),
);

export class ActivityPortfolioError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "ActivityPortfolioError";
    this.statusCode = statusCode;
  }
}

export function createActivityPortfolioService({ authDb, now = () => new Date() }) {
  const db = authDb.db;

  function getPortfolio(user) {
    const row = db
      .prepare(
        `SELECT
          application_plan_json,
          activities_json,
          competitions_json,
          summer_schools_json,
          recommendation_letters_json,
          planning_actions_json,
          deepseek_notes_json,
          school_selection_versions_json,
          academic_records_json,
          updated_at
        FROM student_activity_portfolios
        WHERE user_id = ?`,
      )
      .get(requireUserId(user));

    if (!row) return emptyPortfolio();
    return {
      applicationPlan: parseApplicationPlan(row.application_plan_json),
      activities: parseCollection(row.activities_json, ACTIVITY_LIMIT, ACTIVITY_FIELDS, "Activities"),
      competitions: parseCollection(
        row.competitions_json,
        COMPETITION_LIMIT,
        COMPETITION_FIELDS,
        "Competitions",
      ),
      summerSchools: parseCollection(
        row.summer_schools_json,
        SUMMER_SCHOOL_LIMIT,
        SUMMER_SCHOOL_FIELDS,
        "Summer schools",
      ),
      recommendationLetters: parseRecommendationLetters(row.recommendation_letters_json),
      planningActions: parseCollection(
        row.planning_actions_json,
        PLANNING_ACTION_LIMIT,
        PLANNING_ACTION_FIELDS,
        "Planning actions",
      ),
      deepSeekNotes: parseCollection(
        row.deepseek_notes_json,
        DEEPSEEK_NOTE_LIMIT,
        DEEPSEEK_NOTE_FIELDS,
        "DeepSeek notes",
      ),
      schoolSelectionVersions: parseCollection(
        row.school_selection_versions_json,
        SCHOOL_SELECTION_VERSION_LIMIT,
        SCHOOL_SELECTION_VERSION_FIELDS,
        "School selection versions",
      ),
      academicRecords: parseAcademicRecords(row.academic_records_json),
      updatedAt: row.updated_at,
    };
  }

  function savePortfolio(user, payload = {}) {
    const userId = requireUserId(user);
    const portfolio = normalizePortfolio(payload);
    const timestamp = now().toISOString();
    db.prepare(
      `INSERT INTO student_activity_portfolios (
        user_id,
        application_plan_json,
        activities_json,
        competitions_json,
        summer_schools_json,
        recommendation_letters_json,
        planning_actions_json,
        deepseek_notes_json,
        school_selection_versions_json,
        academic_records_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        application_plan_json = excluded.application_plan_json,
        activities_json = excluded.activities_json,
        competitions_json = excluded.competitions_json,
        summer_schools_json = excluded.summer_schools_json,
        recommendation_letters_json = excluded.recommendation_letters_json,
        planning_actions_json = excluded.planning_actions_json,
        deepseek_notes_json = excluded.deepseek_notes_json,
        school_selection_versions_json = excluded.school_selection_versions_json,
        academic_records_json = excluded.academic_records_json,
        updated_at = excluded.updated_at`,
    ).run(
      userId,
      JSON.stringify(portfolio.applicationPlan),
      JSON.stringify(portfolio.activities),
      JSON.stringify(portfolio.competitions),
      JSON.stringify(portfolio.summerSchools),
      JSON.stringify(portfolio.recommendationLetters),
      JSON.stringify(portfolio.planningActions),
      JSON.stringify(portfolio.deepSeekNotes),
      JSON.stringify(portfolio.schoolSelectionVersions),
      JSON.stringify(portfolio.academicRecords),
      timestamp,
      timestamp,
    );
    return getPortfolio(user);
  }

  return {
    getPortfolio,
    savePortfolio,
  };
}

function emptyPortfolio() {
  return {
    applicationPlan: emptyApplicationPlan(),
    activities: [],
    competitions: [],
    summerSchools: [],
    recommendationLetters: {},
    planningActions: [],
    deepSeekNotes: [],
    schoolSelectionVersions: [],
    academicRecords: defaultAcademicRecords(),
    updatedAt: null,
  };
}

function normalizePortfolio(payload) {
  const value = normalizeObject(payload, "Activity portfolio");
  return {
    applicationPlan: normalizeApplicationPlan(value.applicationPlan),
    activities: normalizeCollection(value.activities, ACTIVITY_LIMIT, ACTIVITY_FIELDS, "Activities"),
    competitions: normalizeCollection(
      value.competitions,
      COMPETITION_LIMIT,
      COMPETITION_FIELDS,
      "Competitions",
    ),
    summerSchools: normalizeCollection(
      value.summerSchools,
      SUMMER_SCHOOL_LIMIT,
      SUMMER_SCHOOL_FIELDS,
      "Summer schools",
    ),
    recommendationLetters: normalizeRecommendationLetters(value.recommendationLetters),
    planningActions: normalizeCollection(
      value.planningActions,
      PLANNING_ACTION_LIMIT,
      PLANNING_ACTION_FIELDS,
      "Planning actions",
    ),
    deepSeekNotes: normalizeCollection(
      value.deepSeekNotes,
      DEEPSEEK_NOTE_LIMIT,
      DEEPSEEK_NOTE_FIELDS,
      "DeepSeek notes",
    ),
    schoolSelectionVersions: normalizeCollection(
      value.schoolSelectionVersions,
      SCHOOL_SELECTION_VERSION_LIMIT,
      SCHOOL_SELECTION_VERSION_FIELDS,
      "School selection versions",
    ),
    academicRecords: normalizeAcademicRecords(value.academicRecords),
  };
}

function emptyApplicationPlan() {
  return Object.fromEntries(APPLICATION_ROUND_KEYS.map((round) => [round, []]));
}

function normalizeApplicationPlan(value) {
  if (value === undefined || value === null) return emptyApplicationPlan();
  const item = normalizeObject(value, "Application plan");
  const plan = emptyApplicationPlan();
  for (const round of APPLICATION_ROUND_KEYS) {
    plan[round] = normalizeApplicationRound(
      item[round],
      APPLICATION_ROUND_LIMITS[round],
      `Application plan ${round.toUpperCase()}`,
    );
  }
  if (plan.rea.length > 0) plan.ed1 = [];
  return plan;
}

function normalizeApplicationRound(value, limit, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ActivityPortfolioError(`${label} must be an array`, 400);
  return value
    .map((entry) => normalizeRecord(entry, APPLICATION_PLAN_FIELDS, label))
    .filter((entry) => entry.school)
    .slice(0, limit);
}

function normalizeCollection(value, limit, fields, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ActivityPortfolioError(`${label} must be an array`, 400);
  return value
    .map((item) => normalizeRecord(item, fields, label))
    .filter(hasAnyValue)
    .slice(0, limit);
}

function normalizeRecord(value, fields, label) {
  const item = normalizeObject(value, `${label} item`);
  return Object.fromEntries(fields.map((field) => [field, cleanString(item[field])]));
}

function normalizeRecommendationLetters(value) {
  if (value === undefined || value === null) return {};
  const item = normalizeObject(value, "Recommendation letters");
  return pruneEmpty({
    counselorStatus: cleanString(item.counselorStatus),
    teacher1: normalizeNestedRecord(item.teacher1, [
      "subject",
      "teacherName",
      "relationshipStrength",
      "materials",
    ]),
    teacher2: normalizeNestedRecord(item.teacher2, [
      "subject",
      "teacherName",
      "relationshipStrength",
      "materials",
    ]),
    outsideRecommender: normalizeNestedRecord(item.outsideRecommender, [
      "identity",
      "relationship",
      "scenario",
    ]),
    preparedMaterials: normalizeStringList(item.preparedMaterials),
    notes: cleanString(item.notes),
  });
}

function defaultAcademicRecords() {
  return {
    gpaScale: "",
    gpaRecords: DEFAULT_GPA_RECORDS.map((record) => ({ ...record })),
    satTests: [],
    apExams: [],
    standardizedPlan: {},
  };
}

function normalizeAcademicRecords(value) {
  if (value === undefined || value === null) return defaultAcademicRecords();
  const item = normalizeObject(value, "Academic records");
  return {
    gpaScale: GPA_SCALE_OPTIONS.has(cleanString(item.gpaScale)) ? cleanString(item.gpaScale) : "",
    gpaRecords: Object.hasOwn(item, "gpaRecords")
      ? normalizeCollection(item.gpaRecords, GPA_RECORD_LIMIT, GPA_RECORD_FIELDS, "GPA records")
      : defaultAcademicRecords().gpaRecords,
    satTests: normalizeSatTests(item.satTests),
    apExams: normalizeApExams(item.apExams),
    standardizedPlan: normalizeStandardizedPlan(item.standardizedPlan),
  };
}

function normalizeSatTests(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ActivityPortfolioError("SAT tests must be an array", 400);
  return value
    .map((entry) => {
      const item = normalizeObject(entry, "SAT test item");
      return {
        totalScore: normalizeScore(item.totalScore, 400, 1600),
        englishScore: normalizeScore(item.englishScore, 200, 800),
        mathScore: normalizeScore(item.mathScore, 200, 800),
        testDate: cleanString(item.testDate),
      };
    })
    .filter(hasAnyValue)
    .slice(0, SAT_TEST_LIMIT);
}

function normalizeApExams(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ActivityPortfolioError("AP exams must be an array", 400);
  return value
    .map((entry) => {
      const item = normalizeRecord(entry, AP_EXAM_FIELDS, "AP exam");
      return {
        ...item,
        score: AP_SCORE_OPTIONS.has(item.score) ? item.score : "",
      };
    })
    .filter(hasAnyValue)
    .slice(0, AP_EXAM_LIMIT);
}

function normalizeStandardizedPlan(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActivityPortfolioError("Standardized plan must be an object", 400);
  }
  const normalized = normalizeLooseJson(value, 0);
  return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : {};
}

function normalizeLooseJson(value, depth) {
  if (depth > STANDARDIZED_PLAN_MAX_DEPTH) return "";
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return cleanString(value).slice(0, 2000);
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, STANDARDIZED_PLAN_ARRAY_LIMIT)
      .map((entry) => normalizeLooseJson(entry, depth + 1))
      .filter((entry) => !isLooseJsonEmpty(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, STANDARDIZED_PLAN_OBJECT_FIELD_LIMIT)
        .map(([key, entry]) => [cleanString(key).slice(0, 80), normalizeLooseJson(entry, depth + 1)])
        .filter(([key, entry]) => key && !isLooseJsonEmpty(entry)),
    );
  }
  return cleanString(value).slice(0, 2000);
}

function isLooseJsonEmpty(value) {
  if (value === "" || value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value && typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function normalizeScore(value, min, max) {
  const text = cleanString(value);
  if (!text) return "";
  const score = Number(text);
  if (!Number.isInteger(score) || score < min || score > max) return "";
  return String(score);
}

function normalizeNestedRecord(value, fields) {
  if (value === undefined || value === null) return {};
  return pruneEmpty(normalizeRecord(value, fields, "Recommendation letter"));
}

function normalizeStringList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new ActivityPortfolioError("Prepared materials must be an array", 400);
  }
  return value.map(cleanString).filter(Boolean);
}

function parseCollection(serialized, limit, fields, label) {
  try {
    return normalizeCollection(JSON.parse(serialized), limit, fields, label);
  } catch (error) {
    if (error instanceof ActivityPortfolioError) {
      throw new ActivityPortfolioError("Stored activity portfolio is invalid", 500);
    }
    throw error;
  }
}

function parseRecommendationLetters(serialized) {
  try {
    return normalizeRecommendationLetters(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof ActivityPortfolioError || error instanceof SyntaxError) {
      throw new ActivityPortfolioError("Stored activity portfolio is invalid", 500);
    }
    throw error;
  }
}

function parseAcademicRecords(serialized) {
  try {
    return normalizeAcademicRecords(JSON.parse(serialized || "{}"));
  } catch (error) {
    if (error instanceof ActivityPortfolioError || error instanceof SyntaxError) {
      throw new ActivityPortfolioError("Stored activity portfolio is invalid", 500);
    }
    throw error;
  }
}

function parseApplicationPlan(serialized) {
  try {
    return normalizeApplicationPlan(JSON.parse(serialized));
  } catch (error) {
    if (error instanceof ActivityPortfolioError || error instanceof SyntaxError) {
      throw new ActivityPortfolioError("Stored activity portfolio is invalid", 500);
    }
    throw error;
  }
}

function normalizeObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActivityPortfolioError(`${label} must be an object`, 400);
  }
  return value;
}

function pruneEmpty(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) return entry.length > 0;
      if (entry && typeof entry === "object") return Object.keys(entry).length > 0;
      return Boolean(entry);
    }),
  );
}

function hasAnyValue(record) {
  return Object.values(record).some(Boolean);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function requireUserId(user) {
  const id = Number(user?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ActivityPortfolioError("Not authenticated", 401);
  }
  return id;
}
