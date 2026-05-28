const ACTIVITY_LIMIT = 10;
const COMPETITION_LIMIT = 5;
const SUMMER_SCHOOL_LIMIT = 3;
const APPLICATION_ROUND_KEYS = ["rea", "ed1", "ed2", "ea", "uc", "rd"];
const APPLICATION_ROUND_LIMITS = {
  rea: 1,
  ed1: 1,
  ed2: 1,
  ea: 50,
  uc: 20,
  rd: 50,
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
const APPLICATION_PLAN_FIELDS = ["school", "major"];

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
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        application_plan_json = excluded.application_plan_json,
        activities_json = excluded.activities_json,
        competitions_json = excluded.competitions_json,
        summer_schools_json = excluded.summer_schools_json,
        recommendation_letters_json = excluded.recommendation_letters_json,
        updated_at = excluded.updated_at`,
    ).run(
      userId,
      JSON.stringify(portfolio.applicationPlan),
      JSON.stringify(portfolio.activities),
      JSON.stringify(portfolio.competitions),
      JSON.stringify(portfolio.summerSchools),
      JSON.stringify(portfolio.recommendationLetters),
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
