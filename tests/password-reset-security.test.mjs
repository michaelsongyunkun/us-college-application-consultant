import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";
import { createAuthService } from "../src/server/auth-service.mjs";
import { buildCookieHeader } from "./csrf-test-helpers.mjs";

const httpTempDir = await mkdtemp(join(tmpdir(), "consultant-reset-http-"));
const httpAuthDb = createAuthDatabase({ databasePath: join(httpTempDir, "auth.sqlite") });
const sentMessages = [];
const httpServer = createAppServer({
  authDb: httpAuthDb,
  appBaseUrl: "https://consultant.example.com",
  mailer: {
    async sendPasswordResetEmail(message) {
      sentMessages.push(message);
    },
  },
});

try {
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));

  const registrationResponse = await post("/api/auth/register", {
    email: "reset-http@example.com",
    name: "Reset HTTP",
    password: "old-password123",
  });
  assert.equal(registrationResponse.status, 200);
  const registrationCookie = registrationResponse.headers.get("set-cookie");
  const registration = await registrationResponse.json();

  const resetRequestResponse = await post("/api/auth/request-password-reset", {
    email: "reset-http@example.com",
  });
  assert.equal(resetRequestResponse.status, 200);
  assert.deepEqual(await resetRequestResponse.json(), {
    message: "如果邮箱已注册，重置邮件会发送到该邮箱。",
  });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "reset-http@example.com");
  assert.match(sentMessages[0].resetUrl, /^https:\/\/consultant\.example\.com\/\?resetToken=/u);

  const resetToken = new URL(sentMessages[0].resetUrl).searchParams.get("resetToken");
  assert.ok(resetToken);
  assert.equal(
    httpAuthDb.db.prepare("SELECT COUNT(*) AS count FROM password_reset_tokens WHERE token_hash = ?").get(resetToken).count,
    0,
    "Raw reset token must never be stored as token_hash.",
  );
  const resetRows = httpAuthDb.db.prepare("SELECT * FROM password_reset_tokens").all();
  assert.equal(resetRows.length, 1);
  assert.match(resetRows[0].token_hash, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(resetRows[0].token_hash, resetToken);
  assert.equal(JSON.stringify(resetRows).includes(resetToken), false);
  assert.equal(resetRows[0].used_at, null);
  assert.ok(Date.parse(resetRows[0].expires_at) > Date.now());

  const resetPasswordResponse = await post("/api/auth/reset-password", {
    token: resetToken,
    password: "new-password123",
  });
  assert.equal(resetPasswordResponse.status, 200);

  const usedRow = httpAuthDb.db
    .prepare("SELECT used_at AS usedAt FROM password_reset_tokens WHERE id = ?")
    .get(resetRows[0].id);
  assert.ok(usedRow.usedAt);
  assert.equal(
    httpAuthDb.db.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?").get(registration.user.id).count,
    0,
    "Successful password reset must clear existing sessions.",
  );

  const staleSessionResponse = await get("/api/auth/me", registrationCookie);
  assert.equal(staleSessionResponse.status, 401);

  const replayResponse = await post("/api/auth/reset-password", {
    token: resetToken,
    password: "replayed-password123",
  });
  assert.equal(replayResponse.status, 400);
  assert.deepEqual(await replayResponse.json(), { error: "Invalid or expired reset link" });

  const oldPasswordLogin = await post("/api/auth/login", {
    email: "reset-http@example.com",
    password: "old-password123",
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await post("/api/auth/login", {
    email: "reset-http@example.com",
    password: "new-password123",
  });
  assert.equal(newPasswordLogin.status, 200);
} finally {
  await new Promise((resolve) => httpServer.close(resolve));
  await rm(httpTempDir, { recursive: true, force: true });
}

const ttlTempDir = await mkdtemp(join(tmpdir(), "consultant-reset-ttl-"));
const ttlAuthDb = createAuthDatabase({ databasePath: join(ttlTempDir, "auth.sqlite") });
let currentTime = new Date("2026-06-18T00:00:00.000Z");
const ttlAuth = createAuthService({
  authDb: ttlAuthDb,
  passwordResetTtlMs: 1_000,
  now: () => currentTime,
});

try {
  ttlAuth.register({
    email: "reset-ttl@example.com",
    name: "Reset TTL",
    password: "old-password123",
  });
  const resetRequest = ttlAuth.createPasswordReset("reset-ttl@example.com");
  assert.equal(resetRequest.expiresAt, "2026-06-18T00:00:01.000Z");
  const tokenRow = ttlAuthDb.db
    .prepare("SELECT token_hash AS tokenHash, expires_at AS expiresAt, used_at AS usedAt FROM password_reset_tokens")
    .get();
  assert.match(tokenRow.tokenHash, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(tokenRow.tokenHash, resetRequest.resetToken);
  assert.equal(tokenRow.expiresAt, resetRequest.expiresAt);
  assert.equal(tokenRow.usedAt, null);

  currentTime = new Date("2026-06-18T00:00:02.000Z");
  assert.throws(
    () =>
      ttlAuth.resetPassword({
        resetToken: resetRequest.resetToken,
        password: "new-password123",
      }),
    /invalid or expired reset link/i,
  );
  assert.equal(
    ttlAuthDb.db.prepare("SELECT used_at AS usedAt FROM password_reset_tokens").get().usedAt,
    null,
    "Expired reset token must not be marked used after a rejected reset attempt.",
  );
  assert.throws(
    () => ttlAuth.login({ email: "reset-ttl@example.com", password: "new-password123" }),
    /invalid email or password/i,
  );
  assert.equal(
    ttlAuth.login({ email: "reset-ttl@example.com", password: "old-password123" }).user.email,
    "reset-ttl@example.com",
  );
} finally {
  ttlAuthDb.close();
  await rm(ttlTempDir, { recursive: true, force: true });
}

function get(path, cookie = "") {
  return fetch(`${serverUrl()}${path}`, {
    headers: cookie ? { Cookie: buildCookieHeader(cookie) } : {},
  });
}

function post(path, payload) {
  return fetch(`${serverUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function serverUrl() {
  const { port } = httpServer.address();
  return `http://127.0.0.1:${port}`;
}
