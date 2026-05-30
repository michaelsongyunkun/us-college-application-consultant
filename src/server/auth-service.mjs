import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const USAGE_EVENT_TYPES = new Set([
  "parse_codex_answer",
  "parse_codex_failure",
  "export_json",
  "export_word",
  "save_draft",
  "clear_draft",
  "generate_plan_success",
  "generate_plan_failure",
  "generate_deepseek_plan_success",
  "generate_deepseek_plan_failure",
  "build_codex_task",
  "copy_codex_task",
  "refresh_competitions",
  "refresh_summer_schools",
  "refresh_case_matches",
  "course_helper_visit",
  "refresh_ap_recommendations",
  "data_load_failure",
]);
const FEEDBACK_STATUS_OPTIONS = new Set(["未处理", "处理中", "已解决", "已忽略"]);

class AuthError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function createAuthService({
  authDb,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  passwordResetTtlMs = DEFAULT_PASSWORD_RESET_TTL_MS,
  now = () => new Date(),
} = {}) {
  const db = authDb.db;

  function register({ email, name, password }, metadata = {}) {
    const normalizedEmail = normalizeEmail(email);
    const displayName = normalizeName(name);
    assertPassword(password);

    const timestamp = now().toISOString();
    try {
      const result = db
        .prepare(
          `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(normalizedEmail, displayName, "user", hashPassword(password), timestamp, timestamp);

      const user = findUserById(result.lastInsertRowid);
      return createLoginResult(user, metadata);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new AuthError("Email is already registered", 409);
      }
      throw error;
    }
  }

  function login({ email, password }, metadata = {}) {
    const normalizedEmail = normalizeEmail(email);
    const user = findUserByEmail(normalizedEmail);
    if (!user || !verifyPassword(password || "", user.password_hash)) {
      recordLoginEvent({
        user,
        status: "failure",
        metadata,
        attemptedEmail: normalizedEmail,
        failureReason: "Invalid email or password",
      });
      throw new AuthError("Invalid email or password", 401);
    }

    return createLoginResult(user, metadata);
  }

  function getUserForSession(sessionToken) {
    if (!sessionToken) return null;
    const session = db
      .prepare(
        `SELECT users.*, sessions.expires_at AS session_expires_at
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?`,
      )
      .get(hashSessionToken(sessionToken));

    if (!session) return null;
    if (new Date(session.session_expires_at).getTime() <= now().getTime()) {
      logout(sessionToken);
      return null;
    }

    return toPublicUser(session);
  }

  function logout(sessionToken) {
    if (!sessionToken) return;
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(sessionToken));
  }

  function createPasswordReset(email) {
    const normalizedEmail = normalizeEmail(email);
    const user = findUserByEmail(normalizedEmail);
    if (!user) return null;

    cleanupExpiredPasswordResetTokens();
    const resetToken = randomBytes(32).toString("base64url");
    const timestamp = now().toISOString();
    const expiresAt = new Date(now().getTime() + passwordResetTtlMs).toISOString();

    db.prepare(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(user.id, hashSessionToken(resetToken), expiresAt, timestamp);

    return {
      user: toPublicUser(user),
      resetToken,
      expiresAt,
    };
  }

  function resetPassword({ resetToken, password }) {
    assertPassword(password);
    const tokenHash = hashSessionToken(resetToken || "");
    const resetRecord = db
      .prepare(
        `SELECT password_reset_tokens.*, users.email, users.name, users.role
         FROM password_reset_tokens
         JOIN users ON users.id = password_reset_tokens.user_id
         WHERE password_reset_tokens.token_hash = ?`,
      )
      .get(tokenHash);

    if (
      !resetRecord ||
      resetRecord.used_at ||
      new Date(resetRecord.expires_at).getTime() <= now().getTime()
    ) {
      throw new AuthError("Invalid or expired reset link", 400);
    }

    const timestamp = now().toISOString();
    const updatePassword = db.prepare(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    );
    const markUsed = db.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
    );
    const clearSessions = db.prepare("DELETE FROM sessions WHERE user_id = ?");

    const transaction = db.transaction(() => {
      updatePassword.run(hashPassword(password), timestamp, resetRecord.user_id);
      markUsed.run(timestamp, resetRecord.id);
      clearSessions.run(resetRecord.user_id);
    });
    transaction();

    return toPublicUser({
      id: resetRecord.user_id,
      email: resetRecord.email,
      name: resetRecord.name,
      role: resetRecord.role,
    });
  }

  function cleanupExpiredSessions() {
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now().toISOString());
  }

  function cleanupExpiredPasswordResetTokens() {
    db.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").run(now().toISOString());
  }

  function createLoginResult(user, metadata = {}) {
    cleanupExpiredSessions();
    const sessionToken = randomBytes(32).toString("base64url");
    const timestamp = now().toISOString();
    const expiresAt = new Date(now().getTime() + sessionTtlMs).toISOString();
    const createSession = db.prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    );
    const updateLoginStats = db.prepare(
      `UPDATE users
       SET login_count = login_count + 1, last_login_at = ?, updated_at = ?
       WHERE id = ?`,
    );
    const transaction = db.transaction(() => {
      createSession.run(user.id, hashSessionToken(sessionToken), expiresAt, timestamp);
      updateLoginStats.run(timestamp, timestamp, user.id);
      recordLoginEvent({ user, status: "success", metadata, occurredAt: timestamp });
    });
    transaction();

    return {
      user: toPublicUser(findUserById(user.id)),
      sessionToken,
      expiresAt,
    };
  }

  function recordLoginEvent({
    user,
    status,
    metadata = {},
    attemptedEmail = "",
    failureReason = "",
    occurredAt = now().toISOString(),
  }) {
    const date = new Date(occurredAt);
    db.prepare(
      `INSERT INTO login_events (
        user_id,
        user_name,
        user_email,
        occurred_at,
        login_date,
        login_week,
        status,
        user_agent,
        ip_address,
        failure_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user?.id || null,
      user?.name || "",
      user?.email || attemptedEmail,
      occurredAt,
      occurredAt.slice(0, 10),
      getWeekKey(date),
      status,
      metadata.userAgent || "",
      metadata.ipAddress || "",
      failureReason,
    );
  }

  function getLoginDashboard({ requester, filters = {} } = {}) {
    assertAdmin(requester);
    const where = [];
    const params = {};
    if (filters.query) {
      where.push("(users.name LIKE @query OR users.email LIKE @query)");
      params.query = `%${filters.query}%`;
    }
    const users = db
      .prepare(
        `SELECT
          users.id,
          users.email,
          users.name,
          users.role,
          users.login_count AS loginCount,
          users.last_login_at AS lastLoginAt,
          users.created_at AS createdAt
        FROM users
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY users.last_login_at DESC NULLS LAST, users.created_at DESC`,
      )
      .all(params);

    const eventFilters = buildEventFilters(filters);
    const trendEventFilters = buildEventFilters(filters, { includeStatus: false });
    const events = db
      .prepare(
        `SELECT
          id,
          user_id AS userId,
          user_name AS userName,
          user_email AS userEmail,
          occurred_at AS occurredAt,
          login_date AS loginDate,
          login_week AS loginWeek,
          status,
          user_agent AS userAgent,
          ip_address AS ipAddress,
          failure_reason AS failureReason
        FROM login_events
        ${eventFilters.where}
        ORDER BY occurred_at DESC
        LIMIT 200`,
      )
      .all(eventFilters.params);

    const dailyActivity = db
      .prepare(
        `SELECT login_date AS date, status, COUNT(*) AS count
         FROM login_events
         ${trendEventFilters.where}
         GROUP BY login_date, status
         ORDER BY login_date DESC
         LIMIT 60`,
      )
      .all(trendEventFilters.params);

    const weeklyActivity = db
      .prepare(
        `SELECT login_week AS week, status, COUNT(*) AS count
         FROM login_events
         ${trendEventFilters.where}
         GROUP BY login_week, status
         ORDER BY login_week DESC
         LIMIT 26`,
      )
      .all(trendEventFilters.params);

    const baseUsageFilters = buildUsageFilters(filters, { includeEventType: false });
    const usageFilters = buildUsageFilters(filters);
    const usageSummary = db
      .prepare(
        `SELECT event_type AS eventType, COUNT(*) AS count
         FROM usage_events
         ${usageFilters.where}
         GROUP BY event_type
         ORDER BY event_type`,
      )
      .all(usageFilters.params);
    const usageEvents = db
      .prepare(
        `SELECT
          id,
          user_id AS userId,
          user_name AS userName,
          user_email AS userEmail,
          event_type AS eventType,
          grade,
          major_direction AS majorDirection,
          completion_fields AS completionFields,
          filled_activity_count AS filledActivityCount,
          generated_activity_count AS generatedActivityCount,
          duration_ms AS durationMs,
          failure_reason AS failureReason,
          details_json AS detailsJson,
          occurred_at AS occurredAt,
          event_date AS eventDate,
          event_week AS eventWeek,
          user_agent AS userAgent,
          ip_address AS ipAddress
        FROM usage_events
        ${usageFilters.where}
        ORDER BY occurred_at DESC
        LIMIT 200`,
      )
      .all(usageFilters.params);

    const overview = {
      activeUsers: db
        .prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM usage_events ${baseUsageFilters.where}`)
        .get(baseUsageFilters.params).count,
      planGenerations: countUsageEvents("generate_plan_success", baseUsageFilters),
      wordExports: countUsageEvents("export_word", baseUsageFilters),
      recommendationRefreshes: db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM usage_events
           ${appendFilterCondition(baseUsageFilters.where, "event_type IN ('refresh_competitions', 'refresh_summer_schools', 'refresh_case_matches')")}`,
        )
        .get(baseUsageFilters.params).count,
      failedLogins: db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM login_events
           ${appendFilterCondition(trendEventFilters.where, "status = 'failure'")}`,
        )
        .get(trendEventFilters.params).count,
    };

    const feedbackFilters = buildFeedbackFilters(filters);
    const feedbackEntries = db
      .prepare(
        `SELECT
          id,
          user_id AS userId,
          user_name AS userName,
          user_email AS userEmail,
          issue_type AS issueType,
          page_name AS pageName,
          description,
          steps,
          contact,
          feedback_status AS feedbackStatus,
          admin_note AS adminNote,
          created_at AS createdAt,
          feedback_date AS feedbackDate,
          user_agent AS userAgent,
          ip_address AS ipAddress
        FROM feedback_entries
        ${feedbackFilters.where}
        ORDER BY created_at DESC
        LIMIT 200`,
      )
      .all(feedbackFilters.params);

    return {
      overview,
      users,
      events,
      dailyActivity,
      weeklyActivity,
      usageSummary,
      usageEvents,
      feedbackEntries,
    };

    function countUsageEvents(eventType, activeFilters) {
      return db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM usage_events
           ${appendFilterCondition(activeFilters.where, "event_type = @overviewEventType")}`,
        )
        .get({ ...activeFilters.params, overviewEventType: eventType }).count;
    }
  }

  function recordFeedback({ user = null, payload = {}, metadata = {} } = {}) {
    const issueType = normalizeLimitedLine(payload.issueType, 60);
    const pageName = normalizeLimitedLine(payload.pageName, 80);
    const description = normalizeLimitedText(payload.description, 2000);
    const steps = normalizeLimitedText(payload.steps, 1600);
    const contact = normalizeLimitedLine(payload.contact, 120);
    if (!issueType) throw new AuthError("请选择问题类型", 400);
    if (!pageName) throw new AuthError("请填写遇到问题的页面或功能", 400);
    if (description.length < 10) throw new AuthError("请至少用 10 个字描述问题", 400);

    const timestamp = now().toISOString();
    const result = db
      .prepare(
        `INSERT INTO feedback_entries (
          user_id,
          user_name,
          user_email,
          issue_type,
          page_name,
          description,
          steps,
          contact,
          created_at,
          feedback_date,
          user_agent,
          ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        user?.id || null,
        user?.name || "",
        user?.email || "",
        issueType,
        pageName,
        description,
        steps,
        contact,
        timestamp,
        timestamp.slice(0, 10),
        metadata.userAgent || "",
        metadata.ipAddress || "",
      );

    return {
      id: Number(result.lastInsertRowid),
      createdAt: timestamp,
      feedbackStatus: "未处理",
      adminNote: "",
    };
  }

  function updateFeedbackEntry({ requester, feedbackId, payload = {} } = {}) {
    assertAdmin(requester);
    const id = Number(feedbackId);
    if (!Number.isInteger(id) || id < 1) {
      throw new AuthError("Invalid feedback id", 400);
    }
    const existing = selectFeedbackEntryById(id);
    if (!existing) throw new AuthError("Feedback entry not found", 404);

    const feedbackStatus = normalizeFeedbackStatus(payload.feedbackStatus ?? existing.feedbackStatus);
    const adminNote = Object.hasOwn(payload, "adminNote")
      ? normalizeLimitedText(payload.adminNote, 1000)
      : existing.adminNote;

    db.prepare(
      `UPDATE feedback_entries
       SET feedback_status = ?, admin_note = ?
       WHERE id = ?`,
    ).run(feedbackStatus, adminNote, id);

    return selectFeedbackEntryById(id);
  }

  function recordUsageEvent({
    user,
    eventType,
    profile = {},
    metrics = {},
    details = {},
    metadata = {},
  }) {
    if (!user?.id) throw new AuthError("Not authenticated", 401);
    if (!USAGE_EVENT_TYPES.has(eventType)) {
      throw new AuthError("Unsupported usage event", 400);
    }
    const timestamp = now().toISOString();
    const date = new Date(timestamp);
    db.prepare(
      `INSERT INTO usage_events (
        user_id,
        user_name,
        user_email,
        event_type,
        grade,
        major_direction,
        completion_fields,
        filled_activity_count,
        generated_activity_count,
        duration_ms,
        failure_reason,
        details_json,
        occurred_at,
        event_date,
        event_week,
        user_agent,
        ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      user.name,
      user.email,
      eventType,
      String(profile.grade || "").trim(),
      String(profile.majorDirection || "").trim(),
      toNonNegativeInteger(metrics.completionFields),
      toNonNegativeInteger(metrics.filledActivityCount),
      toNonNegativeInteger(metrics.generatedActivityCount),
      toNonNegativeInteger(metrics.durationMs),
      String(details.failureReason || "").trim(),
      JSON.stringify(details || {}),
      timestamp,
      timestamp.slice(0, 10),
      getWeekKey(date),
      metadata.userAgent || "",
      metadata.ipAddress || "",
    );
  }

  function buildEventFilters(filters, { includeStatus = true } = {}) {
    const conditions = [];
    const params = {};
    if (filters.query) {
      conditions.push("(user_name LIKE @eventQuery OR user_email LIKE @eventQuery)");
      params.eventQuery = `%${filters.query}%`;
    }
    if (includeStatus && filters.status && ["success", "failure"].includes(filters.status)) {
      conditions.push("status = @status");
      params.status = filters.status;
    }
    if (filters.fromDate) {
      conditions.push("login_date >= @fromDate");
      params.fromDate = filters.fromDate;
    }
    if (filters.toDate) {
      conditions.push("login_date <= @toDate");
      params.toDate = filters.toDate;
    }
    return {
      where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildUsageFilters(filters, { includeEventType = true } = {}) {
    const conditions = [];
    const params = {};
    if (filters.query) {
      conditions.push("(user_name LIKE @usageQuery OR user_email LIKE @usageQuery)");
      params.usageQuery = `%${filters.query}%`;
    }
    if (filters.fromDate) {
      conditions.push("event_date >= @usageFromDate");
      params.usageFromDate = filters.fromDate;
    }
    if (filters.toDate) {
      conditions.push("event_date <= @usageToDate");
      params.usageToDate = filters.toDate;
    }
    if (includeEventType && USAGE_EVENT_TYPES.has(filters.eventType)) {
      conditions.push("event_type = @eventType");
      params.eventType = filters.eventType;
    }
    return {
      where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function buildFeedbackFilters(filters) {
    const conditions = [];
    const params = {};
    if (filters.query) {
      conditions.push(
        "(user_name LIKE @feedbackQuery OR user_email LIKE @feedbackQuery OR contact LIKE @feedbackQuery OR issue_type LIKE @feedbackQuery OR page_name LIKE @feedbackQuery OR description LIKE @feedbackQuery OR feedback_status LIKE @feedbackQuery OR admin_note LIKE @feedbackQuery)",
      );
      params.feedbackQuery = `%${filters.query}%`;
    }
    if (filters.fromDate) {
      conditions.push("feedback_date >= @feedbackFromDate");
      params.feedbackFromDate = filters.fromDate;
    }
    if (filters.toDate) {
      conditions.push("feedback_date <= @feedbackToDate");
      params.feedbackToDate = filters.toDate;
    }
    return {
      where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  }

  function selectFeedbackEntryById(feedbackId) {
    return db
      .prepare(
        `SELECT
          id,
          user_id AS userId,
          user_name AS userName,
          user_email AS userEmail,
          issue_type AS issueType,
          page_name AS pageName,
          description,
          steps,
          contact,
          feedback_status AS feedbackStatus,
          admin_note AS adminNote,
          created_at AS createdAt,
          feedback_date AS feedbackDate,
          user_agent AS userAgent,
          ip_address AS ipAddress
        FROM feedback_entries
        WHERE id = ?`,
      )
      .get(feedbackId);
  }

  function appendFilterCondition(where, condition) {
    return where ? `${where} AND ${condition}` : `WHERE ${condition}`;
  }

  function findUserByEmail(email) {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  }

  function findUserById(id) {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }

  return {
    register,
    login,
    logout,
    getUserForSession,
    createPasswordReset,
    resetPassword,
    getLoginDashboard,
    recordFeedback,
    updateFeedbackEntry,
    recordUsageEvent,
    cleanupExpiredSessions,
  };
}

export { AuthError };

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AuthError("Please enter a valid email address", 400);
  }
  return normalized;
}

function normalizeName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) {
    throw new AuthError("Please enter your name", 400);
  }
  return normalized;
}

function assertPassword(password) {
  if (String(password || "").length < 8) {
    throw new AuthError("Password must be at least 8 characters", 400);
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt:${salt}:${key}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, key] = String(storedHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const candidate = Buffer.from(scryptSync(password, salt, 32).toString("base64url"));
  const expected = Buffer.from(key);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function hashSessionToken(sessionToken) {
  return createHash("sha256").update(sessionToken).digest("base64url");
}

function toPublicUser(user) {
  return {
    id: Number(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

function assertAdmin(user) {
  if (!user || user.role !== "admin") {
    throw new AuthError("Admin access required", 403);
  }
}

function normalizeFeedbackStatus(value) {
  const status = normalizeLimitedLine(value, 20);
  if (!FEEDBACK_STATUS_OPTIONS.has(status)) {
    throw new AuthError("Unsupported feedback status", 400);
  }
  return status;
}

function getWeekKey(date) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toNonNegativeInteger(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function normalizeLimitedLine(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeLimitedText(value, maxLength) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, maxLength);
}
