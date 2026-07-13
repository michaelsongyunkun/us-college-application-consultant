import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/postgres.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/consultant" },
  strict: true,
  verbose: true,
});
