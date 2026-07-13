import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";
import { jsonHeaders } from "./csrf-test-helpers.mjs";

const tempDir = await mkdtemp(join(tmpdir(), "consultant-word-export-jobs-"));
const jobId = "12345678-1234-4123-a123-123456789abc";
const calls = [];
const wordExportJobs = {
  async create(user, _task, descriptor) {
    calls.push({ operation: "create", user, descriptor });
    return { id: jobId, status: "pending" };
  },
  async get(user, requestedJobId) {
    calls.push({ operation: "get", user, jobId: requestedJobId });
    return requestedJobId === jobId
      ? { id: jobId, status: "completed", result: { downloadUrl: "/download/report.doc" } }
      : null;
  },
  async cancel(user, requestedJobId) {
    calls.push({ operation: "cancel", user, jobId: requestedJobId });
    return requestedJobId === jobId ? { id: jobId, status: "cancelled" } : null;
  },
};
const server = createAppServer({
  databasePath: join(tempDir, "auth.sqlite"),
  env: {},
  jobServices: { wordExport: wordExportJobs },
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const registration = await fetch(`${serverUrl()}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "word-export@example.com",
      name: "Word Export User",
      password: "password123",
    }),
  });
  assert.equal(registration.status, 200);
  const cookies = registration.headers.get("set-cookie");

  const createResponse = await fetch(`${serverUrl()}/api/export-word-jobs`, {
    method: "POST",
    headers: jsonHeaders(cookies),
    body: JSON.stringify({ document: "<html>report</html>", userId: 999 }),
  });
  assert.equal(createResponse.status, 202);
  assert.deepEqual(await createResponse.json(), { jobId, status: "pending" });
  assert.equal(calls[0].descriptor.type, "export.word");
  assert.equal(calls[0].descriptor.payload.document, "<html>report</html>");
  assert.equal(calls[0].descriptor.payload.userId, calls[0].user.id);
  assert.notEqual(calls[0].descriptor.payload.userId, 999);

  const getResponse = await fetch(`${serverUrl()}/api/export-word-jobs/${jobId}`, {
    headers: jsonHeaders(cookies),
  });
  assert.equal(getResponse.status, 200);
  assert.deepEqual(await getResponse.json(), {
    jobId,
    status: "completed",
    result: { downloadUrl: "/download/report.doc" },
  });

  const cancelResponse = await fetch(`${serverUrl()}/api/export-word-jobs/${jobId}`, {
    method: "DELETE",
    headers: jsonHeaders(cookies),
  });
  assert.equal(cancelResponse.status, 200);
  assert.deepEqual(await cancelResponse.json(), { jobId, status: "cancelled" });
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}

function serverUrl() {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server is not listening");
  return `http://127.0.0.1:${address.port}`;
}
