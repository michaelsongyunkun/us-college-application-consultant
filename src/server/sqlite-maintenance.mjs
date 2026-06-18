import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";

export function resolveSqliteDatabasePath(env = process.env, { root = process.cwd() } = {}) {
  const configuredPath = env.AUTH_DATABASE_PATH || env.DATABASE_PATH;
  return configuredPath ? resolve(root, configuredPath) : join(root, "data", "auth.sqlite");
}

export function defaultBackupDirectory(env = process.env, { root = process.cwd() } = {}) {
  return resolve(root, env.DATABASE_BACKUP_DIR || join("backups", "sqlite"));
}

export async function backupSqliteDatabase({
  databasePath,
  backupDir,
  now = () => new Date(),
} = {}) {
  if (!databasePath) throw new Error("databasePath is required.");
  if (!existsSync(databasePath)) throw new Error(`SQLite database does not exist: ${databasePath}`);
  mkdirSync(backupDir, { recursive: true });
  const timestamp = formatTimestamp(now());
  const backupPath = join(backupDir, `${basename(databasePath, ".sqlite")}-${timestamp}.sqlite`);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(backupPath);
  } finally {
    db.close();
  }
  return { backupPath };
}

export function restoreSqliteDatabase({ databasePath, backupPath, now = () => new Date() } = {}) {
  if (!databasePath) throw new Error("databasePath is required.");
  if (!backupPath) throw new Error("backupPath is required.");
  if (!existsSync(backupPath)) throw new Error(`Backup file does not exist: ${backupPath}`);
  if (!statSync(backupPath).isFile()) throw new Error(`Backup path is not a file: ${backupPath}`);

  mkdirSync(dirname(databasePath), { recursive: true });
  const timestamp = formatTimestamp(now());
  const preservedFiles = [];
  preserveIfExists(databasePath, `${databasePath}.pre-restore-${timestamp}`, preservedFiles);
  preserveIfExists(`${databasePath}-wal`, `${databasePath}-wal.pre-restore-${timestamp}`, preservedFiles);
  preserveIfExists(`${databasePath}-shm`, `${databasePath}-shm.pre-restore-${timestamp}`, preservedFiles);
  copyFileSync(backupPath, databasePath);
  return { databasePath, backupPath, preservedFiles };
}

function preserveIfExists(sourcePath, targetPath, preservedFiles) {
  if (!existsSync(sourcePath)) return;
  renameSync(sourcePath, targetPath);
  preservedFiles.push(targetPath);
}

function formatTimestamp(date) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, "Z")
    .replace(/[:.]/gu, "-");
}
