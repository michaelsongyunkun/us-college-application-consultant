#!/usr/bin/env node
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedAdminUser } from "../src/server/admin-seed-service.mjs";
import { AUTH_DATABASE_MIGRATIONS, createAuthDatabase } from "../src/server/auth-db.mjs";
import { loadEnvFile } from "../src/server/env-loader.mjs";
import {
  backupSqliteDatabase,
  defaultBackupDirectory,
  resolveSqliteDatabasePath,
  restoreSqliteDatabase,
} from "../src/server/sqlite-maintenance.mjs";
import {
  getMigrationStatus,
  rollbackLastMigration,
} from "../src/server/sqlite-migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnvFile(join(root, ".env"));

const args = process.argv.slice(2);
const command = args[0] || "status";
const databasePath = resolveSqliteDatabasePath(process.env, { root });
const backupDir = defaultBackupDirectory(process.env, { root });

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function run() {
  if (command === "status") {
    printJson(getStatus());
    return;
  }

  if (command === "migrate") {
    const authDb = createAuthDatabase({ databasePath });
    try {
      printJson({ databasePath, ...getStatus(authDb.db) });
    } finally {
      authDb.close();
    }
    return;
  }

  if (command === "rollback") {
    requireFlag("--yes", "Rollback can remove schema objects. Re-run with --yes to confirm.");
    const db = openExistingDatabase();
    try {
      const rolledBack = rollbackLastMigration(db, AUTH_DATABASE_MIGRATIONS);
      printJson({ databasePath, rolledBack });
    } finally {
      db.close();
    }
    return;
  }

  if (command === "backup") {
    const backup = await backupSqliteDatabase({ databasePath, backupDir });
    printJson({ databasePath, ...backup });
    return;
  }

  if (command === "restore") {
    requireFlag("--yes", "Restore replaces the active SQLite file. Re-run with --yes to confirm.");
    const backupPath = getOption("--backup");
    const restore = restoreSqliteDatabase({ databasePath, backupPath });
    printJson(restore);
    return;
  }

  if (command === "seed-admin") {
    const authDb = createAuthDatabase({ databasePath });
    try {
      const result = seedAdminUser({
        authDb,
        email: process.env.ADMIN_EMAIL,
        name: process.env.ADMIN_NAME || "Administrator",
        password: process.env.ADMIN_PASSWORD,
      });
      printJson({ databasePath, ...result });
    } finally {
      authDb.close();
    }
    return;
  }

  throw new Error(
    `Unknown db command "${command}". Use status, migrate, rollback, backup, restore, or seed-admin.`,
  );
}

function getStatus(existingDb) {
  if (!existsSync(databasePath) && !existingDb) {
    return {
      databasePath,
      exists: false,
      applied: [],
      pending: AUTH_DATABASE_MIGRATIONS.map(({ id, description = "" }) => ({ id, description })),
      unknown: [],
    };
  }

  const db = existingDb || new Database(databasePath);
  try {
    return {
      databasePath,
      exists: true,
      ...getMigrationStatus(db, AUTH_DATABASE_MIGRATIONS),
    };
  } finally {
    if (!existingDb) db.close();
  }
}

function openExistingDatabase() {
  if (!existsSync(databasePath)) throw new Error(`SQLite database does not exist: ${databasePath}`);
  return new Database(databasePath);
}

function getOption(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required.`);
  return args[index + 1];
}

function requireFlag(name, message) {
  if (!args.includes(name)) throw new Error(message);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}
