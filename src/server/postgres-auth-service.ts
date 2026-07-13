import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  AI_ACTION_EVENTS,
  AuthError,
  EXPORT_ACTION_EVENTS,
  FAILURE_ACTION_EVENTS,
  RECOMMENDATION_ACTION_EVENTS,
  SAVE_ACTION_EVENTS,
  USAGE_EVENT_TYPES,
  assertPassword,
  getUsageEventCategory,
  getWeekKey,
  hashPassword,
  normalizeEmail,
  normalizeName,
  redactAuditEvent,
  redactFeedbackEntry,
  redactLoginEvent,
  redactUsageEvent,
  redactUserSummary,
  summarizeUsageCategories,
  toPublicUser,
  verifyPassword,
} from "./auth-service.mjs";

const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const DEFAULT_PASSWORD_RESET_TTL_MS = 30 * 60_000;

export function createPostgresAuthService({ pool, sessionTtlMs = DEFAULT_SESSION_TTL_MS, passwordResetTtlMs = DEFAULT_PASSWORD_RESET_TTL_MS, now = () => new Date() }: any) {
  async function register({ email, name, password }: any, metadata: any = {}) {
    const normalizedEmail = normalizeEmail(email); const displayName = normalizeName(name); assertPassword(password);
    const timestamp = now().toISOString();
    try {
      const { rows } = await pool.query("INSERT INTO users (email,name,role,password_hash,created_at,updated_at) VALUES ($1,$2,'user',$3,$4,$4) RETURNING *", [normalizedEmail, displayName, hashPassword(password), timestamp]);
      return createLoginResult(rows[0], metadata);
    } catch (error: any) { if (error?.code === "23505") throw new AuthError("Email is already registered", 409); throw error; }
  }

  async function login({ email, password }: any, metadata: any = {}) {
    const normalizedEmail = normalizeEmail(email);
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [normalizedEmail]);
    const user = rows[0];
    if (!user || !verifyPassword(password || "", user.password_hash)) {
      await recordLoginEvent({ user, status: "failure", metadata, attemptedEmail: normalizedEmail, failureReason: "Invalid email or password" });
      throw new AuthError("Invalid email or password", 401);
    }
    return createLoginResult(user, metadata);
  }

  async function getUserForSession(sessionToken: string) {
    if (!sessionToken) return null;
    const { rows } = await pool.query("SELECT u.*,s.expires_at AS session_expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1", [hashToken(sessionToken)]);
    const user = rows[0];
    if (!user) return null;
    if (new Date(user.session_expires_at).getTime() <= now().getTime()) { await logout(sessionToken); return null; }
    return toPublicUser(user);
  }

  async function logout(sessionToken: string) { if (sessionToken) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(sessionToken)]); }

  async function issueCsrfToken(sessionToken: string) {
    const session = await findValidSession(sessionToken); if (!session) return null;
    const csrfToken = randomBytes(32).toString("base64url");
    await pool.query("UPDATE sessions SET csrf_token_hash=$1 WHERE id=$2", [hashToken(csrfToken), session.id]);
    return csrfToken;
  }

  async function verifyCsrfToken(sessionToken: string, csrfToken: string) {
    if (!sessionToken || !csrfToken) return false;
    const session = await findValidSession(sessionToken);
    return Boolean(session?.csrf_token_hash && safeEqual(hashToken(csrfToken), session.csrf_token_hash));
  }

  async function createPasswordReset(email: string) {
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [normalizeEmail(email)]);
    const user = rows[0]; if (!user) return null;
    await pool.query("DELETE FROM password_reset_tokens WHERE expires_at <= $1", [now().toISOString()]);
    const resetToken = randomBytes(32).toString("base64url"); const timestamp = now().toISOString();
    const expiresAt = new Date(now().getTime() + passwordResetTtlMs).toISOString();
    await pool.query("INSERT INTO password_reset_tokens (user_id,token_hash,expires_at,created_at) VALUES ($1,$2,$3,$4)", [user.id, hashToken(resetToken), expiresAt, timestamp]);
    return { user: toPublicUser(user), resetToken, expiresAt };
  }

  async function resetPassword({ resetToken, password }: any) {
    assertPassword(password);
    const timestamp = now().toISOString(); const passwordHash = hashPassword(password); const client = await pool.connect();
    let record;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("WITH claimed AS (UPDATE password_reset_tokens SET used_at=$2 WHERE token_hash=$1 AND used_at IS NULL AND expires_at>$2 RETURNING id,user_id) SELECT claimed.*,u.email,u.name,u.role FROM claimed JOIN users u ON u.id=claimed.user_id", [hashToken(resetToken || ""), timestamp]);
      record = rows[0];
      if (!record) throw new AuthError("Invalid or expired reset link", 400);
      await client.query("UPDATE users SET password_hash=$1,updated_at=$2 WHERE id=$3", [passwordHash, timestamp, record.user_id]);
      await client.query("DELETE FROM sessions WHERE user_id=$1", [record.user_id]);
      await client.query("COMMIT");
    }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return toPublicUser({ id: record.user_id, email: record.email, name: record.name, role: record.role });
  }

  async function createLoginResult(user: any, metadata: any) {
    await cleanupExpiredSessions();
    const sessionToken = randomBytes(32).toString("base64url"); const csrfToken = randomBytes(32).toString("base64url");
    const timestamp = now().toISOString(); const expiresAt = new Date(now().getTime() + sessionTtlMs).toISOString(); const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO sessions (user_id,token_hash,csrf_token_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5)", [user.id, hashToken(sessionToken), hashToken(csrfToken), expiresAt, timestamp]);
      const { rows } = await client.query("UPDATE users SET login_count=login_count+1,last_login_at=$1,updated_at=$1 WHERE id=$2 RETURNING *", [timestamp, user.id]);
      await insertLoginEvent(client, { user, status: "success", metadata, occurredAt: timestamp });
      await client.query("COMMIT");
      return { user: toPublicUser(rows[0]), sessionToken, csrfToken, expiresAt };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async function recordLoginEvent(input: any) { await insertLoginEvent(pool, input); }
  async function insertLoginEvent(client: any, { user, status, metadata = {}, attemptedEmail = "", failureReason = "", occurredAt = now().toISOString() }: any) {
    await client.query("INSERT INTO login_events (user_id,user_name,user_email,occurred_at,login_date,login_week,status,user_agent,ip_address,failure_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [user?.id || null, user?.name || "", user?.email || attemptedEmail, occurredAt, occurredAt.slice(0, 10), getWeekKey(new Date(occurredAt)), status, metadata.userAgent || "", metadata.ipAddress || "", failureReason]);
  }

  async function recordFeedback({ user = null, payload = {}, metadata = {} }: any = {}) {
    const issueType = limited(payload.issueType, 60); const pageName = limited(payload.pageName, 80); const description = limited(payload.description, 2000); const steps = limited(payload.steps, 1600); const contact = limited(payload.contact, 120);
    if (!issueType) throw new AuthError("请选择问题类型", 400); if (!pageName) throw new AuthError("请填写遇到问题的页面或功能", 400); if (description.length < 10) throw new AuthError("请至少用 10 个字描述问题", 400);
    const timestamp = now().toISOString();
    const { rows } = await pool.query("INSERT INTO feedback_entries (user_id,user_name,user_email,issue_type,page_name,description,steps,contact,created_at,feedback_date,user_agent,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,created_at AS \"createdAt\",feedback_status AS \"feedbackStatus\",admin_note AS \"adminNote\"", [user?.id || null, user?.name || "", user?.email || "", issueType, pageName, description, steps, contact, timestamp, timestamp.slice(0, 10), metadata.userAgent || "", metadata.ipAddress || ""]);
    return rows[0];
  }

  async function recordUsageEvent({ user, eventType, profile = {}, metrics = {}, details = {}, metadata = {} }: any) {
    if (!user?.id) throw new AuthError("Not authenticated", 401);
    const timestamp = now().toISOString();
    await pool.query("INSERT INTO usage_events (user_id,user_name,user_email,event_type,grade,major_direction,completion_fields,filled_activity_count,generated_activity_count,duration_ms,failure_reason,details_json,occurred_at,event_date,event_week,user_agent,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", [user.id, user.name || "", user.email || "", eventType, limited(profile.grade, 80), limited(profile.majorDirection, 200), integer(metrics.completionFields), integer(metrics.filledActivityCount), integer(metrics.generatedActivityCount), integer(metrics.durationMs), limited(details.failureReason, 500), details, timestamp, timestamp.slice(0, 10), getWeekKey(new Date(timestamp)), metadata.userAgent || "", metadata.ipAddress || ""]);
  }

  async function recordAuditEvent({ actor = null, action, resourceType, resourceId = "", outcome = "success", details = {}, metadata = {} }: any = {}) {
    if (!limited(action, 100) || !limited(resourceType, 80)) throw new AuthError("Invalid audit event", 400);
    const timestamp = now().toISOString();
    await pool.query("INSERT INTO audit_events (actor_user_id,actor_user_name,actor_user_email,actor_role,action,resource_type,resource_id,outcome,details_json,occurred_at,event_date,user_agent,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)", [actor?.id || null, actor?.name || "", actor?.email || "", actor?.role || "", limited(action, 100), limited(resourceType, 80), limited(resourceId, 120), outcome === "failure" ? "failure" : "success", details, timestamp, timestamp.slice(0, 10), metadata.userAgent || "", metadata.ipAddress || ""]);
  }

  async function getLoginDashboard({ requester, filters = {} }: any = {}) {
    assertAdmin(requester);
    const normalizedFilters = normalizeDashboardFilters(filters);
    const userFilter = buildDashboardFilter(normalizedFilters, { queryColumns: ["name", "email"] });
    const eventFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["user_name", "user_email"],
      dateColumn: "login_date",
      statusColumn: "status",
    });
    const trendEventFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["user_name", "user_email"],
      dateColumn: "login_date",
    });
    const failedLoginFilter = appendDashboardCondition(trendEventFilter, "status =", "failure");
    const usageFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["user_name", "user_email"],
      dateColumn: "event_date",
      eventTypeColumn: "event_type",
    });
    const baseUsageFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["user_name", "user_email"],
      dateColumn: "event_date",
    });
    const feedbackFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["user_name", "user_email", "contact", "issue_type", "page_name", "description", "feedback_status", "admin_note"],
      dateColumn: "feedback_date",
    });
    const auditFilter = buildDashboardFilter(normalizedFilters, {
      queryColumns: ["actor_user_name", "actor_user_email", "action", "resource_type", "resource_id"],
      dateColumn: "event_date",
    });

    const [
      { rows: users },
      { rows: events },
      { rows: dailyActivity },
      { rows: weeklyActivity },
      { rows: usageEvents },
      { rows: feedbackEntries },
      { rows: auditEvents },
      { rows: filteredUsageSummary },
      { rows: baseUsageSummary },
      { rows: activeUserRows },
      { rows: failedLoginRows },
    ] = await Promise.all([
      pool.query(`SELECT id,email,name,role,login_count AS "loginCount",last_login_at AS "lastLoginAt",created_at AS "createdAt" FROM users ${userFilter.where} ORDER BY last_login_at DESC NULLS LAST,created_at DESC LIMIT 200`, userFilter.values),
      pool.query(`SELECT id,user_id AS "userId",user_name AS "userName",user_email AS "userEmail",occurred_at AS "occurredAt",login_date AS "loginDate",login_week AS "loginWeek",status,user_agent AS "userAgent",ip_address AS "ipAddress",failure_reason AS "failureReason" FROM login_events ${eventFilter.where} ORDER BY occurred_at DESC LIMIT 200`, eventFilter.values),
      pool.query(`SELECT login_date AS date,status,COUNT(*)::int AS count FROM login_events ${trendEventFilter.where} GROUP BY login_date,status ORDER BY login_date DESC LIMIT 60`, trendEventFilter.values),
      pool.query(`SELECT login_week AS week,status,COUNT(*)::int AS count FROM login_events ${trendEventFilter.where} GROUP BY login_week,status ORDER BY login_week DESC LIMIT 26`, trendEventFilter.values),
      pool.query(`SELECT id,user_id AS "userId",user_name AS "userName",user_email AS "userEmail",event_type AS "eventType",grade,major_direction AS "majorDirection",completion_fields AS "completionFields",filled_activity_count AS "filledActivityCount",generated_activity_count AS "generatedActivityCount",duration_ms AS "durationMs",failure_reason AS "failureReason",details_json AS "detailsJson",occurred_at AS "occurredAt",event_date AS "eventDate",event_week AS "eventWeek",user_agent AS "userAgent",ip_address AS "ipAddress" FROM usage_events ${usageFilter.where} ORDER BY occurred_at DESC LIMIT 200`, usageFilter.values),
      pool.query(`SELECT id,user_id AS "userId",user_name AS "userName",user_email AS "userEmail",issue_type AS "issueType",page_name AS "pageName",description,steps,contact,feedback_status AS "feedbackStatus",admin_note AS "adminNote",created_at AS "createdAt",feedback_date AS "feedbackDate",user_agent AS "userAgent",ip_address AS "ipAddress" FROM feedback_entries ${feedbackFilter.where} ORDER BY created_at DESC LIMIT 200`, feedbackFilter.values),
      pool.query(`SELECT id,actor_user_id AS "actorUserId",actor_user_name AS "actorUserName",actor_user_email AS "actorUserEmail",actor_role AS "actorRole",action,resource_type AS "resourceType",resource_id AS "resourceId",outcome,details_json AS details,occurred_at AS "occurredAt",event_date AS "eventDate",user_agent AS "userAgent",ip_address AS "ipAddress" FROM audit_events ${auditFilter.where} ORDER BY occurred_at DESC LIMIT 200`, auditFilter.values),
      pool.query(`SELECT event_type AS "eventType",COUNT(*)::int AS count FROM usage_events ${usageFilter.where} GROUP BY event_type ORDER BY event_type`, usageFilter.values),
      pool.query(`SELECT event_type AS "eventType",COUNT(*)::int AS count FROM usage_events ${baseUsageFilter.where} GROUP BY event_type ORDER BY event_type`, baseUsageFilter.values),
      pool.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM usage_events ${baseUsageFilter.where}`, baseUsageFilter.values),
      pool.query(`SELECT COUNT(*)::int AS count FROM login_events ${failedLoginFilter.where}`, failedLoginFilter.values),
    ]);
    const usageSummary = filteredUsageSummary.map((item: any) => ({
      ...item,
      count: Number(item.count || 0),
      category: getUsageEventCategory(item.eventType),
    }));
    const baseUsageCounts = new Map<string, number>(
      baseUsageSummary.map((item: any) => [String(item.eventType), Number(item.count || 0)] as [string, number]),
    );
    return {
      overview: {
        activeUsers: Number(activeUserRows[0]?.count || 0),
        aiActions: sumUsageCounts(baseUsageCounts, AI_ACTION_EVENTS),
        saveActions: sumUsageCounts(baseUsageCounts, SAVE_ACTION_EVENTS),
        exportActions: sumUsageCounts(baseUsageCounts, EXPORT_ACTION_EVENTS),
        recommendationActions: sumUsageCounts(baseUsageCounts, RECOMMENDATION_ACTION_EVENTS),
        failureEvents: Number(failedLoginRows[0]?.count || 0) + sumUsageCounts(baseUsageCounts, FAILURE_ACTION_EVENTS),
      },
      users: users.map(redactUserSummary),
      events: events.map(redactLoginEvent),
      dailyActivity,
      weeklyActivity,
      usageSummary,
      usageCategorySummary: summarizeUsageCategories(usageSummary),
      usageEvents: usageEvents.map(redactUsageEvent),
      feedbackEntries: feedbackEntries.map(redactFeedbackEntry),
      auditEvents: auditEvents.map(redactAuditEvent),
    };
  }

  async function updateFeedbackEntry({ requester, feedbackId, payload = {} }: any = {}) {
    assertAdmin(requester); const id = Number(feedbackId); if (!Number.isInteger(id) || id < 1) throw new AuthError("Invalid feedback id", 400);
    const existing = (await pool.query('SELECT feedback_status AS "feedbackStatus",admin_note AS "adminNote" FROM feedback_entries WHERE id=$1', [id])).rows[0];
    if (!existing) throw new AuthError("Feedback entry not found", 404);
    const status = ["未处理", "处理中", "已解决", "已忽略"].includes(payload.feedbackStatus) ? payload.feedbackStatus : existing.feedbackStatus;
    const adminNote = Object.hasOwn(payload, "adminNote") ? limited(payload.adminNote, 1000) : existing.adminNote;
    const { rows } = await pool.query('UPDATE feedback_entries SET feedback_status=$1,admin_note=$2 WHERE id=$3 RETURNING id,feedback_status AS "feedbackStatus",admin_note AS "adminNote"', [status, adminNote, id]); return rows[0];
  }

  async function exportAccountData({ user, planning, portfolio, progressPlanner }: any = {}) {
    const account = await findRequiredUser(user); return { exportedAt: now().toISOString(), account: { id: Number(account.id), email: account.email, name: account.name, role: account.role, createdAt: account.created_at, updatedAt: account.updated_at, lastLoginAt: account.last_login_at || null, loginCount: Number(account.login_count || 0) }, planning, portfolio, progressPlanner };
  }

  async function deleteAccount({ user, confirmation, metadata = {} }: any = {}) {
    const account = await findRequiredUser(user); if (normalizeEmail(confirmation) !== account.email) throw new AuthError("Account deletion confirmation must match the account email", 400);
    const timestamp = now().toISOString(); const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query("UPDATE login_events SET user_id=NULL,user_name='Deleted user',user_email='' WHERE user_id=$1", [account.id]); await client.query("DELETE FROM feedback_entries WHERE user_id=$1", [account.id]); await client.query("UPDATE audit_events SET actor_user_id=NULL,actor_user_name='Deleted user',actor_user_email='',actor_role='' WHERE actor_user_id=$1", [account.id]); await client.query("DELETE FROM users WHERE id=$1", [account.id]); await client.query("COMMIT"); }
    catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    await recordAuditEvent({ action: "account.delete", resourceType: "user_account", resourceId: "deleted", details: { scope: "self_service" }, metadata });
    return { ok: true, deletedAt: timestamp };
  }

  async function findRequiredUser(user: any) { const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [Number(user?.id)]); if (!rows[0]) throw new AuthError("Account not found", 404); return rows[0]; }
  async function findValidSession(token: string) { if (!token) return null; const { rows } = await pool.query("SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>$2", [hashToken(token), now().toISOString()]); return rows[0] || null; }
  async function cleanupExpiredSessions() { await pool.query("DELETE FROM sessions WHERE expires_at <= $1", [now().toISOString()]); }

  return { register, login, getUserForSession, logout, issueCsrfToken, verifyCsrfToken, createPasswordReset, resetPassword, recordFeedback, recordUsageEvent, recordAuditEvent, getLoginDashboard, updateFeedbackEntry, exportAccountData, deleteAccount, cleanupExpiredSessions };
}

function assertAdmin(user: any) { if (!user || user.role !== "admin") throw new AuthError("Admin access required", 403); }
function hashToken(value: string) { return createHash("sha256").update(String(value)).digest("hex"); }
function safeEqual(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function limited(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function integer(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0; }

function normalizeDashboardFilters(filters: any = {}) {
  return {
    query: limited(filters.query, 120),
    status: ["success", "failure"].includes(filters.status) ? filters.status : "",
    fromDate: limited(filters.fromDate, 10),
    toDate: limited(filters.toDate, 10),
    eventType: USAGE_EVENT_TYPES.has(filters.eventType) ? filters.eventType : "",
  };
}

function buildDashboardFilter(filters: any, {
  queryColumns = [],
  dateColumn = "",
  statusColumn = "",
  eventTypeColumn = "",
}: any = {}) {
  const conditions: string[] = [];
  const values: any[] = [];
  const add = (condition: string, value: any) => {
    values.push(value);
    conditions.push(`${condition} $${values.length}`);
  };
  if (filters.query && queryColumns.length) {
    values.push(`%${filters.query}%`);
    conditions.push(`(${queryColumns.map((column: string) => `${column} ILIKE $${values.length}`).join(" OR ")})`);
  }
  if (statusColumn && filters.status) add(`${statusColumn} =`, filters.status);
  if (dateColumn && filters.fromDate) add(`${dateColumn} >=`, filters.fromDate);
  if (dateColumn && filters.toDate) add(`${dateColumn} <=`, filters.toDate);
  if (eventTypeColumn && filters.eventType) add(`${eventTypeColumn} =`, filters.eventType);
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

function appendDashboardCondition(filter: any, condition: string, value: any) {
  const values = [...filter.values, value];
  const clause = `${condition} $${values.length}`;
  return { where: filter.where ? `${filter.where} AND ${clause}` : `WHERE ${clause}`, values };
}

function sumUsageCounts(counts: Map<string, number>, eventTypes: string[]) {
  return eventTypes.reduce((total, eventType) => total + (counts.get(eventType) || 0), 0);
}
