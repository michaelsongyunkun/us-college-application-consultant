import assert from "node:assert/strict";
import {
  compareMigrationValidation,
  hashCriticalRows,
  normalizeSqliteValueForPostgres,
} from "../src/infrastructure/sqlite-postgres-import.ts";

const rows = [
  { id: 2, user_id: 1, profile_json: '{"grade":"11"}' },
  { id: 1, user_id: 1, profile_json: '{"grade":"10"}' },
];
assert.equal(hashCriticalRows(rows, ["id", "user_id", "profile_json"]), hashCriticalRows([...rows].reverse(), ["id", "user_id", "profile_json"]));
assert.equal(normalizeSqliteValueForPostgres("profile_json", '{"grade":"11"}'), '{"grade":"11"}');
assert.equal(normalizeSqliteValueForPostgres("activities_json", '[{"name":"Robotics"}]'), '[{"name":"Robotics"}]');
assert.equal(normalizeSqliteValueForPostgres("details_json", '"legacy-string"'), '"legacy-string"');
assert.equal(normalizeSqliteValueForPostgres("details_json", "null"), "null");
assert.equal(normalizeSqliteValueForPostgres("user_id", 3), 3);

assert.deepEqual(
  compareMigrationValidation(
    { rowCounts: { users: 2 }, criticalHashes: { users: "abc" }, foreignKeyViolations: [] },
    { rowCounts: { users: 2 }, criticalHashes: { users: "abc" }, foreignKeyViolations: [] },
  ),
  { ok: true, mismatches: [] },
);
assert.equal(
  compareMigrationValidation(
    { rowCounts: { users: 2 }, criticalHashes: { users: "abc" }, foreignKeyViolations: [] },
    { rowCounts: { users: 1 }, criticalHashes: { users: "def" }, foreignKeyViolations: [] },
  ).ok,
  false,
);
