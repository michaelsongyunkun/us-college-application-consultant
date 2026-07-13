import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [dockerfile, compose, workflow, observability, manifest, prompt] = await Promise.all([
  readFile("Dockerfile", "utf8"),
  readFile("compose.yml", "utf8"),
  readFile(".github/workflows/verify.yml", "utf8"),
  readFile("src/server/production-observability.ts", "utf8"),
  readFile("prompts/manifest.json", "utf8"),
  readFile("prompts/us-college-admissions-strategist-agent.md", "utf8"),
]);

assert.match(dockerfile, /FROM node:22-bookworm-slim AS base/);
assert.match(dockerfile, /RUN apt-get update && apt-get install -y --no-install-recommends python3 make g\+\+/);
assert.match(dockerfile, /FROM dependencies AS production-dependencies/);
assert.match(dockerfile, /npm prune --omit=dev/);
assert.doesNotMatch(dockerfile, /npm ci --omit=dev/);
assert.match(dockerfile, /FROM base AS runtime/);
assert.match(dockerfile, /HEALTHCHECK/);
assert.match(compose, /consultant-data:\/app\/data/);
assert.match(workflow, /node-version: "22"/);
assert.doesNotMatch(workflow, /node-version: "20"/);
for (const gate of ["typecheck", "openapi:check", "contracts:compat", "npm audit", "gitleaks", "docker/build-push-action", "eval:ai"]) assert.ok(workflow.includes(gate), `CI should include ${gate}`);
assert.ok(workflow.includes("GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}"), "Gitleaks PR scans should receive the automatic GitHub token.");
for (const forbidden of ["studentProfile", "prompt", "messages", "context", "authorization", "cookie", "apiKey"]) assert.ok(observability.includes(forbidden), `Redaction should include ${forbidden}`);
assert.equal(JSON.stringify(JSON.parse(manifest)).includes(prompt), false, "Manifest must reference prompt metadata, not duplicate prompt content.");
