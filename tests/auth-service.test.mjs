import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthDatabase } from "../auth-db.mjs";
import { createAuthService } from "../auth-service.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-auth-"));
const dbPath = join(tempDir, "auth.sqlite");
let authDb;

try {
  authDb = createAuthDatabase({ databasePath: dbPath });
  const auth = createAuthService({ authDb, sessionTtlMs: 60 * 60 * 1000 });

  const registration = auth.register({
    email: "STUDENT@example.com",
    name: "Student User",
    password: "password123",
  });

  assert.equal(registration.user.email, "student@example.com");
  assert.equal(registration.user.name, "Student User");
  assert.equal(registration.user.role, "user");
  assert.ok(registration.sessionToken);
  assert.equal(registration.user.password_hash, undefined);

  assert.throws(
    () =>
      auth.register({
        email: "student@example.com",
        name: "Student User",
        password: "password123",
      }),
    /already registered/i,
  );

  const login = auth.login({
    email: "student@example.com",
    password: "password123",
  });
  assert.equal(login.user.id, registration.user.id);
  assert.ok(login.sessionToken);

  assert.throws(
    () =>
      auth.login({
        email: "student@example.com",
        password: "wrong-password",
      }),
    /invalid email or password/i,
  );

  const currentUser = auth.getUserForSession(login.sessionToken);
  assert.equal(currentUser.email, "student@example.com");

  auth.logout(login.sessionToken);
  assert.equal(auth.getUserForSession(login.sessionToken), null);

  const expiringAuth = createAuthService({ authDb, sessionTtlMs: -1 });
  const expiredLogin = expiringAuth.login({
    email: "student@example.com",
    password: "password123",
  });
  assert.equal(expiringAuth.getUserForSession(expiredLogin.sessionToken), null);

  const resetRequest = auth.createPasswordReset("student@example.com");
  assert.equal(resetRequest.user.email, "student@example.com");
  assert.ok(resetRequest.resetToken);
  assert.ok(resetRequest.expiresAt);

  const missingResetRequest = auth.createPasswordReset("missing@example.com");
  assert.equal(missingResetRequest, null);

  auth.resetPassword({
    resetToken: resetRequest.resetToken,
    password: "new-password123",
  });

  assert.throws(
    () =>
      auth.resetPassword({
        resetToken: resetRequest.resetToken,
        password: "another-password123",
      }),
    /invalid or expired reset link/i,
  );

  const newLogin = auth.login({
    email: "student@example.com",
    password: "new-password123",
  }, {
    userAgent: "Test Browser",
    ipAddress: "127.0.0.1",
  });
  assert.equal(newLogin.user.email, "student@example.com");

  assert.throws(
    () =>
      auth.login({
        email: "student@example.com",
        password: "password123",
      }),
    /invalid email or password/i,
  );

  const expiredResetAuth = createAuthService({ authDb, passwordResetTtlMs: -1 });
  const expiredResetRequest = expiredResetAuth.createPasswordReset("student@example.com");
  assert.throws(
    () =>
      expiredResetAuth.resetPassword({
        resetToken: expiredResetRequest.resetToken,
        password: "expired-password123",
      }),
    /invalid or expired reset link/i,
  );

  const impersonatedAdminRegistration = auth.register({
    email: "admin@example.com",
    name: "Yunkun Song",
    password: "password123",
  });
  assert.equal(impersonatedAdminRegistration.user.role, "user");

  authDb.db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run("admin@example.com");
  const adminLogin = auth.login({
    email: "admin@example.com",
    password: "password123",
  });
  assert.equal(adminLogin.user.role, "admin");

  assert.throws(
    () =>
      auth.login(
        {
          email: "student@example.com",
          password: "incorrect-password",
        },
        {
          userAgent: "Failed Browser",
          ipAddress: "192.0.2.10",
        },
    ),
    /invalid email or password/i,
  );

  auth.recordUsageEvent({
    user: registration.user,
    eventType: "generate_plan_success",
  });
  auth.recordUsageEvent({
    user: registration.user,
    eventType: "export_word",
  });
  auth.recordUsageEvent({
    user: registration.user,
    eventType: "refresh_competitions",
  });

  const dashboard = auth.getLoginDashboard({
    requester: adminLogin.user,
  });
  const studentSummary = dashboard.users.find((user) => user.email === "student@example.com");
  assert.ok(studentSummary);
  assert.equal(studentSummary.loginCount, 4);
  assert.ok(studentSummary.lastLoginAt);
  assert.ok(dashboard.events.some((event) => event.status === "failure"));
  assert.ok(dashboard.events.some((event) => event.userAgent === "Failed Browser"));
  assert.ok(dashboard.dailyActivity.length >= 1);
  assert.ok(dashboard.weeklyActivity.length >= 1);
  assert.deepEqual(dashboard.overview, {
    activeUsers: 1,
    planGenerations: 1,
    wordExports: 1,
    recommendationRefreshes: 1,
    failedLogins: 3,
  });

  const exportsOnly = auth.getLoginDashboard({
    requester: adminLogin.user,
    filters: { eventType: "export_word" },
  });
  assert.deepEqual(exportsOnly.usageEvents.map((event) => event.eventType), ["export_word"]);
  assert.equal(exportsOnly.overview.planGenerations, 1);

  assert.throws(
    () =>
      auth.getLoginDashboard({
        requester: registration.user,
      }),
    /admin access required/i,
  );
} finally {
  authDb?.close();
  await rm(tempDir, { recursive: true, force: true });
}
