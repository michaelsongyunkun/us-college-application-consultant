import { hashPassword } from "./auth-service.mjs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function seedAdminUser({
  authDb,
  email,
  name = "Administrator",
  password,
  now = () => new Date(),
} = {}) {
  if (!authDb?.db) throw new Error("authDb is required.");
  const normalizedEmail = normalizeEmail(email);
  const displayName = normalizeName(name);
  assertPassword(password);

  const db = authDb.db;
  const timestamp = now().toISOString();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
  if (existing) {
    db.prepare(
      `UPDATE users
       SET name = ?, role = 'admin', password_hash = ?, updated_at = ?
       WHERE id = ?`,
    ).run(displayName, hashPassword(password), timestamp, existing.id);
    return { created: false, email: normalizedEmail, role: "admin" };
  }

  db.prepare(
    `INSERT INTO users (email, name, role, password_hash, created_at, updated_at)
     VALUES (?, ?, 'admin', ?, ?, ?)`,
  ).run(normalizedEmail, displayName, hashPassword(password), timestamp, timestamp);
  return { created: true, email: normalizedEmail, role: "admin" };
}

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) throw new Error("ADMIN_EMAIL must be a valid email address.");
  return normalized;
}

function normalizeName(name) {
  const normalized = String(name || "").trim();
  if (!normalized) throw new Error("ADMIN_NAME must not be empty.");
  return normalized;
}

function assertPassword(password) {
  if (String(password || "").length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
  }
}
