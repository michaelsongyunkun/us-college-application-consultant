import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedAdminUser } from "../src/server/admin-seed-service.mjs";
import { AUTH_DATABASE_MIGRATIONS, createAuthDatabase } from "../src/server/auth-db.mjs";
import { createAuthService } from "../src/server/auth-service.mjs";
import {
  backupSqliteDatabase,
  restoreSqliteDatabase,
} from "../src/server/sqlite-maintenance.mjs";
import {
  getMigrationStatus,
  rollbackLastMigration,
} from "../src/server/sqlite-migrations.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-sqlite-maintenance-"));
const databasePath = join(tempDir, "auth.sqlite");
const backupDir = join(tempDir, "backups");
let authDb;

try {
  authDb = createAuthDatabase({ databasePath });
  let status = getMigrationStatus(authDb.db, AUTH_DATABASE_MIGRATIONS);
  assert.deepEqual(status.pending, []);
  assert.equal(status.unknown.length, 0);
  assert.equal(status.applied[0].id, "0001_auth_sqlite_baseline");

  let auth = createAuthService({ authDb });
  auth.register({
    email: "first@example.com",
    name: "First User",
    password: "password123",
  });

  const backup = await backupSqliteDatabase({
    databasePath,
    backupDir,
    now: () => new Date("2026-06-18T12:00:00.000Z"),
  });
  assert.ok(existsSync(backup.backupPath));

  auth.register({
    email: "second@example.com",
    name: "Second User",
    password: "password123",
  });

  authDb.close();
  authDb = null;
  const restore = restoreSqliteDatabase({
    databasePath,
    backupPath: backup.backupPath,
    now: () => new Date("2026-06-18T12:30:00.000Z"),
  });
  assert.equal(restore.preservedFiles.length, 1);
  assert.ok(existsSync(restore.preservedFiles[0]));

  authDb = createAuthDatabase({ databasePath });
  assert.ok(authDb.db.prepare("SELECT id FROM users WHERE email = ?").get("first@example.com"));
  assert.equal(
    authDb.db.prepare("SELECT id FROM users WHERE email = ?").get("second@example.com"),
    undefined,
  );

  const seeded = seedAdminUser({
    authDb,
    email: "ADMIN@example.com",
    name: "Seed Admin",
    password: "adminpass123",
    now: () => new Date("2026-06-18T13:00:00.000Z"),
  });
  assert.equal(seeded.created, true);
  assert.equal(seeded.email, "admin@example.com");
  const adminRow = authDb.db.prepare("SELECT role, password_hash FROM users WHERE email = ?").get("admin@example.com");
  assert.equal(adminRow.role, "admin");
  assert.notEqual(adminRow.password_hash, "adminpass123");
  auth = createAuthService({ authDb });
  assert.equal(
    auth.login({ email: "admin@example.com", password: "adminpass123" }).user.role,
    "admin",
  );

  const reseeded = seedAdminUser({
    authDb,
    email: "admin@example.com",
    name: "Updated Admin",
    password: "newadminpass123",
  });
  assert.equal(reseeded.created, false);
  assert.equal(
    auth.login({ email: "admin@example.com", password: "newadminpass123" }).user.name,
    "Updated Admin",
  );

  const rolledBack = rollbackLastMigration(authDb.db, AUTH_DATABASE_MIGRATIONS);
  assert.equal(rolledBack.id, "0001_auth_sqlite_baseline");
  assert.equal(authDb.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get(), undefined);
  status = getMigrationStatus(authDb.db, AUTH_DATABASE_MIGRATIONS);
  assert.equal(status.applied.length, 0);
  assert.equal(status.pending[0].id, "0001_auth_sqlite_baseline");
} finally {
  authDb?.close();
  await rm(tempDir, { recursive: true, force: true });
}
