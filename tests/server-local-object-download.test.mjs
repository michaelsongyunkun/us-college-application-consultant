import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";
import { createLocalObjectStore } from "../src/infrastructure/object-store.ts";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-local-download-"));
const store = createLocalObjectStore({
  root: join(tempDir, "objects"),
  signingSecret: "local-download-test-secret",
});
await store.put({
  userId: 7,
  key: "exports/parent-report.doc",
  body: Buffer.from("parent report", "utf8"),
  contentType: "application/msword",
});
const signed = await store.getSignedDownloadUrl({
  userId: 7,
  key: "exports/parent-report.doc",
  expiresInSeconds: 60,
});
const server = createAppServer({
  databasePath: join(tempDir, "auth.sqlite"),
  env: {},
  localObjectStore: store,
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const response = await fetch(`${serverUrl()}${signed.url}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/msword");
  assert.match(response.headers.get("content-disposition") || "", /parent-report\.doc/u);
  assert.equal(await response.text(), "parent report");

  const tampered = new URL(signed.url, serverUrl());
  tampered.searchParams.set("signature", "invalid");
  assert.equal((await fetch(tampered)).status, 403);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function serverUrl() {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening");
  return `http://127.0.0.1:${address.port}`;
}
