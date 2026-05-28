import assert from "node:assert/strict";
import { hasAnyApiKey, resolveApiKey } from "../src/server/api-key.mjs";

assert.equal(
  resolveApiKey({ environmentApiKey: "env-key", requestApiKey: "" }),
  "env-key",
);

assert.equal(
  resolveApiKey({ environmentApiKey: "env-key", requestApiKey: "request-key" }),
  "request-key",
);

assert.equal(
  hasAnyApiKey({ environmentApiKey: "", requestApiKey: "request-key" }),
  true,
);

assert.equal(
  hasAnyApiKey({ environmentApiKey: "", requestApiKey: "" }),
  false,
);
