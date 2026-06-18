export class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrationError";
  }
}

export function ensureSchemaMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      applied_at TEXT NOT NULL
    );
  `);
}

export function listAppliedMigrations(db) {
  ensureSchemaMigrationsTable(db);
  return db
    .prepare(
      `SELECT id, description AS description, applied_at AS appliedAt
       FROM schema_migrations
       ORDER BY applied_at ASC, id ASC`,
    )
    .all();
}

export function getMigrationStatus(db, migrations) {
  const applied = listAppliedMigrations(db);
  const knownIds = new Set(migrations.map((migration) => migration.id));
  const appliedIds = new Set(applied.map((migration) => migration.id));
  return {
    applied,
    pending: migrations
      .filter((migration) => !appliedIds.has(migration.id))
      .map(({ id, description = "" }) => ({ id, description })),
    unknown: applied.filter((migration) => !knownIds.has(migration.id)),
  };
}

export function applyPendingMigrations(db, migrations, { now = () => new Date() } = {}) {
  ensureSchemaMigrationsTable(db);
  validateMigrationList(migrations);
  const status = getMigrationStatus(db, migrations);
  if (status.unknown.length) {
    throw new MigrationError(
      `Database has unknown migration(s): ${status.unknown.map((migration) => migration.id).join(", ")}`,
    );
  }

  const appliedIds = new Set(status.applied.map((migration) => migration.id));
  const applied = [];
  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue;
    if (typeof migration.up !== "function") {
      throw new MigrationError(`Migration ${migration.id} is missing an up() function.`);
    }

    const runMigration = db.transaction(() => {
      migration.up(db);
      recordMigrationApplied(db, migration, { now });
    });
    runMigration();
    applied.push({ id: migration.id, description: migration.description || "" });
  }
  return applied;
}

export function recordMigrationApplied(db, migration, { now = () => new Date() } = {}) {
  ensureSchemaMigrationsTable(db);
  db.prepare(
    `INSERT INTO schema_migrations (id, description, applied_at)
     VALUES (?, ?, ?)`,
  ).run(migration.id, migration.description || "", now().toISOString());
}

export function recordMigrationAppliedIfMissing(db, migration, { now = () => new Date() } = {}) {
  ensureSchemaMigrationsTable(db);
  const existing = db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(migration.id);
  if (existing) return false;
  recordMigrationApplied(db, migration, { now });
  return true;
}

export function rollbackLastMigration(db, migrations) {
  ensureSchemaMigrationsTable(db);
  validateMigrationList(migrations);
  const status = getMigrationStatus(db, migrations);
  if (status.unknown.length) {
    throw new MigrationError(
      `Database has unknown migration(s): ${status.unknown.map((migration) => migration.id).join(", ")}`,
    );
  }

  const appliedIds = new Set(status.applied.map((migration) => migration.id));
  const migration = [...migrations].reverse().find((candidate) => appliedIds.has(candidate.id));
  if (!migration) return null;
  if (typeof migration.down !== "function") {
    throw new MigrationError(`Migration ${migration.id} is missing a down() function.`);
  }

  const rollback = db.transaction(() => {
    migration.down(db);
    db.prepare("DELETE FROM schema_migrations WHERE id = ?").run(migration.id);
  });
  rollback();
  return { id: migration.id, description: migration.description || "" };
}

function validateMigrationList(migrations) {
  const ids = new Set();
  for (const migration of migrations) {
    if (!migration?.id) throw new MigrationError("Every migration must have an id.");
    if (ids.has(migration.id)) throw new MigrationError(`Duplicate migration id: ${migration.id}`);
    ids.add(migration.id);
  }
}
