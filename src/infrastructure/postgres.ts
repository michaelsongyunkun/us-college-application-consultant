import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;
const defaultMigrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export function createPostgresPool(env = process.env) {
  const connectionString = String(env.DATABASE_URL || "").trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL.");
  return new Pool({
    connectionString,
    max: integerSetting(env.PG_POOL_MAX, 10, 1, 100),
    idleTimeoutMillis: integerSetting(env.PG_IDLE_TIMEOUT_MS, 30_000, 1_000, 600_000),
    connectionTimeoutMillis: integerSetting(env.PG_CONNECT_TIMEOUT_MS, 5_000, 250, 60_000),
    statement_timeout: integerSetting(env.PG_STATEMENT_TIMEOUT_MS, 30_000, 1_000, 300_000),
    application_name: String(env.OTEL_SERVICE_NAME || "us-college-consultant"),
    ...(resolveSsl(env) ? { ssl: { rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED !== "false" } } : {}),
  });
}

export async function migratePostgres(pool: pg.Pool, { migrationsFolder = defaultMigrationsFolder } = {}) {
  await migrate(drizzle(pool), { migrationsFolder: resolve(migrationsFolder) });
}

export async function withPostgresTransaction<T>(pool: pg.Pool, callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkPostgresReadiness(pool: pg.Pool) {
  const startedAt = Date.now();
  const { rows } = await pool.query("SELECT current_database() AS database, current_setting('server_version') AS version, EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_enabled");
  return { ok: true, latencyMs: Date.now() - startedAt, database: rows[0].database, version: rows[0].version, vectorEnabled: rows[0].vector_enabled };
}

function resolveSsl(env: NodeJS.ProcessEnv) { return env.PG_SSL === "true" || /sslmode=(require|verify-ca|verify-full)/u.test(String(env.DATABASE_URL || "")); }
function integerSetting(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback; }
