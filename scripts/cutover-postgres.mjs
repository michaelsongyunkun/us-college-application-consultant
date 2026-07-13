#!/usr/bin/env node
import Database from "better-sqlite3";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteToPostgresImporter } from "../src/infrastructure/sqlite-postgres-import.ts";
import { createPostgresPool, migratePostgres } from "../src/infrastructure/postgres.ts";
import { loadEnvFile } from "../src/server/env-loader.mjs";
import { backupSqliteDatabase, defaultBackupDirectory, resolveSqliteDatabasePath } from "../src/server/sqlite-maintenance.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnvFile(join(root, ".env"));
const argv = process.argv.slice(2);
const command = argv[0] || "status";
const lockPath = resolve(process.env.WRITE_PAUSE_FILE || join(root, "work", "maintenance", "write-paused.lock"));
const sqlitePath = resolveSqliteDatabasePath(process.env, { root });
const reportPath = resolve(option("--report") || join(root, "work", "migration-reports", `cutover-${Date.now()}.json`));

if (command === "status") {
  console.log(JSON.stringify({ writePaused: existsSync(lockPath), lockPath, sqlitePath }, null, 2));
} else if (command === "rollback") {
  requireYes();
  await rm(lockPath, { force: true });
  console.log(JSON.stringify({ ok: true, mode: "sqlite", writePaused: false, action: "Keep DATABASE_URL unset/disabled and resume SQLite writes.", lockPath }, null, 2));
} else if (command === "resume") {
  requireYes();
  await rm(lockPath, { force: true });
  console.log(JSON.stringify({ ok: true, writePaused: false, lockPath }, null, 2));
} else if (command === "cutover") {
  requireYes();
  await mkdir(dirname(lockPath), { recursive: true });
  await writeFile(lockPath, `${new Date().toISOString()}\n`, { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
  const startedAt = new Date().toISOString();
  let pool;
  let sqlite;
  try {
    const backup = await backupSqliteDatabase({ databasePath: sqlitePath, backupDir: defaultBackupDirectory(process.env, { root }) });
    sqlite = new Database(sqlitePath, { readonly: true });
    sqlite.pragma("foreign_keys = ON");
    pool = createPostgresPool(process.env);
    await migratePostgres(pool);
    const report = await createSqliteToPostgresImporter({ sqlite, pool }).run({ dryRun: false, replace: argv.includes("--replace") });
    const output = {
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      maintenance: { writePaused: true, lockPath },
      backup,
      import: report,
      nextAction: "Set DATABASE_URL for the app and worker, restart both on the same image version, verify /readyz, then run `npm run db:cutover -- resume --yes`.",
      rollback: "If startup or verification fails, unset DATABASE_URL and run `npm run db:cutover -- rollback --yes` to resume SQLite writes.",
    };
    await persistReport(output);
    console.log(JSON.stringify({ reportPath, ...output }, null, 2));
  } catch (error) {
    await rm(lockPath, { force: true });
    const output = { ok: false, startedAt, completedAt: new Date().toISOString(), rolledBackTo: "sqlite", writePaused: false, error: error.message, validation: error.validation || null };
    await persistReport(output);
    console.error(JSON.stringify({ reportPath, ...output }, null, 2));
    process.exitCode = 2;
  } finally {
    sqlite?.close();
    await pool?.end();
  }
} else {
  throw new Error("Use: status | cutover --yes [--replace] | rollback --yes | resume --yes");
}

async function persistReport(payload) { await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8"); }
function option(name) { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : ""; }
function requireYes() { if (!argv.includes("--yes")) throw new Error("Maintenance state changes require --yes."); }
