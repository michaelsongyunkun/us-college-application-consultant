import assert from "node:assert/strict";
import { resolveDatabasePath } from "../server.mjs";

assert.equal(resolveDatabasePath({ AUTH_DATABASE_PATH: "/var/data/auth.sqlite" }), "/var/data/auth.sqlite");
assert.equal(resolveDatabasePath({ DATABASE_PATH: "/tmp/auth.sqlite" }), "/tmp/auth.sqlite");
assert.equal(
  resolveDatabasePath({
    AUTH_DATABASE_PATH: "/var/data/auth.sqlite",
    DATABASE_PATH: "/tmp/auth.sqlite",
  }),
  "/var/data/auth.sqlite",
);
assert.ok(resolveDatabasePath({}).endsWith("data\\auth.sqlite") || resolveDatabasePath({}).endsWith("data/auth.sqlite"));
