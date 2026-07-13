import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createLocalObjectStore,
  createObjectStoreFromEnv,
} from "../src/infrastructure/object-store.ts";

assert.throws(
  () => createObjectStoreFromEnv({ NODE_ENV: "production", OBJECT_STORE_DRIVER: "local" }),
  /OBJECT_STORE_SIGNING_SECRET/u,
);

const root = await mkdtemp(join(tmpdir(), "consultant-object-store-"));
try {
  let now = Date.parse("2026-07-12T00:00:00.000Z");
  const store = createLocalObjectStore({ root, signingSecret: "test-signing-secret", now: () => now });
  const saved = await store.put({
    userId: 7,
    key: "exports/plan.docx",
    body: Buffer.from("report"),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.equal(saved.objectKey, "users/7/exports/plan.docx");
  await assert.rejects(() => store.get({ userId: 8, key: "exports/plan.docx" }), /not found/i);
  await assert.rejects(() => store.put({ userId: 7, key: "../other-user.txt", body: "x" }), /invalid object key/i);

  const signed = await store.getSignedDownloadUrl({ userId: 7, key: "exports/plan.docx", expiresInSeconds: 60 });
  assert.match(signed.url, /^\/api\/objects\/download\?/u);
  assert.equal((await store.readSignedUrl(signed.url)).body.toString("utf8"), "report");
  now += 61_000;
  await assert.rejects(() => store.readSignedUrl(signed.url), /expired/i);
} finally {
  await rm(root, { recursive: true, force: true });
}
