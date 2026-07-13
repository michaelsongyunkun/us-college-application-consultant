#!/usr/bin/env node
import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteToPostgresImporter } from "../src/infrastructure/sqlite-postgres-import.ts";
import { createPostgresPool, migratePostgres } from "../src/infrastructure/postgres.ts";
import { loadEnvFile } from "../src/server/env-loader.mjs";
import { resolveSqliteDatabasePath } from "../src/server/sqlite-maintenance.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnvFile(join(root, ".env"));
const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--execute");
const replace = args.has("--replace");
const sqlitePath = resolveSqliteDatabasePath(process.env, { root });
const reportPath = resolve(option("--report") || join(root, "work", "migration-reports", `sqlite-postgres-${Date.now()}.json`));

if (!dryRun && !args.has("--yes")) throw new Error("Import writes to PostgreSQL. Re-run with --execute --yes after reviewing dry-run output.");
const sqlite = new Database(sqlitePath, { readonly: dryRun });
sqlite.pragma("foreign_keys = ON");
const pool = createPostgresPool(process.env);
try {
  await migratePostgres(pool);
  const importer = createSqliteToPostgresImporter({ sqlite, pool });
  const report = await importer.run({ dryRun, replace });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ sqlitePath, reportPath, ...report }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ sqlitePath, reportPath, ...report }, null, 2));
  if (!report.ok) process.exitCode = 2;
} finally {
  sqlite.close();
  await pool.end();
}

function option(name) { const argv = process.argv.slice(2); const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : ""; }
