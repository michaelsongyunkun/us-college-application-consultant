import { runProductionRepositoryContract } from "./helpers/production-repository-contract.mjs";
import { createSqliteRepositoryFixture } from "../src/repositories/sqlite-production-repositories.ts";

await runProductionRepositoryContract(() => createSqliteRepositoryFixture({ databasePath: ":memory:" }));
