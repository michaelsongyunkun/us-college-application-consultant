#!/usr/bin/env node
import { createPostgresPool, checkPostgresReadiness, migratePostgres } from "../src/infrastructure/postgres.ts";
import { loadEnvFile } from "../src/server/env-loader.mjs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
loadEnvFile(join(root, ".env"));
const pool = createPostgresPool(process.env);
try {
  await migratePostgres(pool);
  console.log(JSON.stringify(await checkPostgresReadiness(pool), null, 2));
} finally { await pool.end(); }
