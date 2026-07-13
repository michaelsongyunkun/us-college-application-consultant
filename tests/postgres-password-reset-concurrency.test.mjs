import assert from "node:assert/strict";
import { createPostgresAuthService } from "../src/server/postgres-auth-service.ts";

let tokenClaimed = false;
let passwordUpdates = 0;
let sessionDeletes = 0;
const resetRecord = {
  id: 9,
  user_id: 1,
  used_at: null,
  expires_at: "2099-01-01T00:00:00.000Z",
  email: "student@example.com",
  name: "Student",
  role: "user",
};

const pool = {
  async query(sql) {
    if (String(sql).startsWith("SELECT r.*")) return { rows: [{ ...resetRecord }] };
    throw new Error(`Unexpected pool query: ${sql}`);
  },
  async connect() {
    return {
      async query(sql) {
        const statement = String(sql);
        if (statement.startsWith("WITH claimed AS")) {
          if (tokenClaimed) return { rows: [] };
          tokenClaimed = true;
          return { rows: [{ ...resetRecord }] };
        }
        if (statement.startsWith("UPDATE users")) passwordUpdates += 1;
        if (statement.startsWith("DELETE FROM sessions")) sessionDeletes += 1;
        return { rows: [] };
      },
      release() {},
    };
  },
};

const auth = createPostgresAuthService({
  pool,
  now: () => new Date("2026-07-13T00:00:00.000Z"),
});
const outcomes = await Promise.allSettled([
  auth.resetPassword({ resetToken: "same-token", password: "password111" }),
  auth.resetPassword({ resetToken: "same-token", password: "password222" }),
]);

assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
assert.equal(passwordUpdates, 1);
assert.equal(sessionDeletes, 1);
