import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const boundaryDoc = await readFile("docs/ARCHITECTURE_BOUNDARIES.md", "utf8");
const adr = await readFile("docs/decisions/ADR-001-native-server-service-boundaries.md", "utf8");
const server = await readFile("server.mjs", "utf8");
const deepSeekPlanService = await readFile("src/server/deepseek-plan-service.mjs", "utf8");
const generationJobService = await readFile("src/server/generation-job-service.mjs", "utf8");
const routeAccessPolicy = await readFile("src/server/route-access-policy.mjs", "utf8");
const staticFileService = await readFile("src/server/static-file-service.mjs", "utf8");
const accountDataRightsService = await readFile("src/server/account-data-rights-service.mjs", "utf8");
const adminOperationsService = await readFile("src/server/admin-operations-service.mjs", "utf8");
const authHttpService = await readFile("src/server/auth-http-service.mjs", "utf8");

for (const heading of [
  "# Architecture Boundaries",
  "## Ownership Matrix",
  "## Route Inventory",
  "## Business Logic Still In server.mjs",
  "## Completed Extractions",
  "## Extraction Rules",
  "## Recommended Extraction Order",
]) {
  assert.ok(boundaryDoc.includes(heading), `Boundary doc should include ${heading}.`);
}

for (const capability of [
  "User and permission",
  "Student profile",
  "Planning versions",
  "Resource recommendation",
  "AI service",
  "Export service",
  "Admin operations",
]) {
  assert.match(boundaryDoc, new RegExp(escapeRegExp(capability), "u"));
}

for (const route of [
  "/healthz",
  "/readyz",
  "/api/admin/ops/metrics",
  "/api/auth/register",
  "/api/account/export",
  "/api/deepseek-plan",
  "/api/deepseek-rag",
  "/api/school-selection",
  "/api/portfolio-capability-assessment",
  "/api/student-profile",
  "/api/my-activities",
  "/api/progress-planner",
  "/api/plans",
  "/api/admin/login-dashboard",
  "/api/admin/audit-log/export",
]) {
  assert.ok(boundaryDoc.includes(route), `Boundary doc should include route ${route}.`);
}

for (const routeNeedle of [
  'url.pathname === "/api/deepseek-plan"',
  'url.pathname === "/api/deepseek-rag"',
  'url.pathname === "/api/school-selection"',
  'url.pathname === "/api/portfolio-capability-assessment"',
  'url.pathname === "/api/admin/login-dashboard"',
  'url.pathname === "/api/admin/audit-log/export"',
]) {
  assert.ok(server.includes(routeNeedle), `Server route inventory changed: ${routeNeedle}`);
}

for (const targetService of [
  "src/server/student-workspace-service.ts",
  "src/repositories/contracts.ts",
]) {
  assert.ok(boundaryDoc.includes(targetService), `Boundary doc should name extraction target ${targetService}.`);
}

assert.ok(boundaryDoc.includes("src/server/deepseek-plan-service.mjs"));
assert.ok(boundaryDoc.includes("DeepSeek plan generation"));
assert.ok(server.includes("createDeepSeekPlanService"));
assert.ok(deepSeekPlanService.includes("export function createDeepSeekPlanService"));
assert.ok(deepSeekPlanService.includes("export class DeepSeekPlanError"));
for (const removedServerFunction of [
  "function compactDeepSeekPlanPayload",
  "function validateParsedDeepSeekPlan",
  "function buildDeepSeekPlanQuality",
]) {
  assert.equal(
    server.includes(removedServerFunction),
    false,
    `server.mjs should delegate ${removedServerFunction} to src/server/deepseek-plan-service.mjs.`,
  );
}

assert.ok(boundaryDoc.includes("src/server/generation-job-service.mjs"));
assert.ok(boundaryDoc.includes("Generation job lifecycle"));
assert.ok(server.includes("createGenerationJobService"));
assert.ok(generationJobService.includes("export function createGenerationJobService"));
assert.ok(generationJobService.includes("export function serializeGenerationJob"));
for (const removedServerFunction of [
  "function createGenerationJobStore",
  "function startGenerationJob",
  "function serializeGenerationJob",
  "function serializeSchoolSelectionJob",
  "function startSchoolSelectionJob",
]) {
  assert.equal(
    server.includes(removedServerFunction),
    false,
    `server.mjs should delegate ${removedServerFunction} to src/server/generation-job-service.mjs.`,
  );
}

assert.ok(boundaryDoc.includes("src/server/route-access-policy.mjs"));
assert.ok(boundaryDoc.includes("Route access policy"));
assert.ok(server.includes("getStaticRouteAccessPolicy"));
assert.ok(server.includes("evaluateRouteAccess"));
assert.ok(routeAccessPolicy.includes("export function getStaticRouteAccessPolicy"));
assert.ok(routeAccessPolicy.includes("export function evaluateRouteAccess"));
for (const protectedPolicyNeedle of [
  '"/course-helper.html"',
  '"/gpa-calculator.html"',
  '"/my-activities.html"',
  '"/planning-tracker.html"',
  '"/school-selection.html"',
  '"/ask-deepseek.html"',
  '"/resource-library.html"',
  '"/school-encyclopedia.html"',
  '"/major-encyclopedia.html"',
]) {
  assert.equal(
    server.includes(protectedPolicyNeedle),
    false,
    `server.mjs should delegate protected page policy ${protectedPolicyNeedle} to src/server/route-access-policy.mjs.`,
  );
  assert.ok(
    routeAccessPolicy.includes(protectedPolicyNeedle),
    `src/server/route-access-policy.mjs should retain protected page policy ${protectedPolicyNeedle}.`,
  );
}
assert.equal(
  server.includes('requestPath.startsWith("/data/")'),
  false,
  "server.mjs should delegate protected data-file policy to src/server/route-access-policy.mjs.",
);
assert.equal(
  server.includes("function requirePageUser"),
  false,
  "server.mjs should not keep a separate protected-page access helper.",
);

assert.ok(boundaryDoc.includes("src/server/static-file-service.mjs"));
assert.ok(boundaryDoc.includes("Static file policy"));
assert.ok(server.includes("buildStaticResponseHeaders"));
assert.ok(server.includes("resolveStaticFilePath"));
assert.ok(server.includes("renderIndexForSession"));
assert.ok(staticFileService.includes("export function buildStaticResponseHeaders"));
assert.ok(staticFileService.includes("export function resolveStaticFilePath"));
assert.ok(staticFileService.includes("export function renderIndexForSession"));
for (const removedServerNeedle of [
  "const contentTypes",
  "const staticCacheExtensions",
  "function cacheHeadersForPath",
  "function renderIndexForAuthMode",
  "function renderIndexForSession",
]) {
  assert.equal(
    server.includes(removedServerNeedle),
    false,
    `server.mjs should delegate static file policy ${removedServerNeedle} to src/server/static-file-service.mjs.`,
  );
}

assert.ok(boundaryDoc.includes("src/server/account-data-rights-service.mjs"));
assert.ok(boundaryDoc.includes("Account data rights"));
assert.ok(server.includes("createAccountDataRightsService"));
assert.ok(server.includes("accountDataRights.exportAccountData"));
assert.ok(server.includes("accountDataRights.deleteAccount"));
assert.ok(accountDataRightsService.includes("export function createAccountDataRightsService"));
assert.ok(accountDataRightsService.includes("export function getAccountDeletionConfirmation"));
for (const removedServerNeedle of [
  "planning.exportUserData(user)",
  'action: "account.data_export"',
  "auth.deleteAccount({",
]) {
  assert.equal(
    server.includes(removedServerNeedle),
    false,
    `server.mjs should delegate account data rights logic ${removedServerNeedle} to src/server/account-data-rights-service.mjs.`,
  );
}
assert.ok(accountDataRightsService.includes("planning.exportUserData(user)"));
assert.ok(accountDataRightsService.includes("activityPortfolio.getPortfolio(user)"));
assert.ok(accountDataRightsService.includes("progressPlanner.getPlanner(user)"));

assert.ok(boundaryDoc.includes("src/server/admin-operations-service.mjs"));
assert.ok(boundaryDoc.includes("Admin operations"));
assert.ok(server.includes("createAdminOperationsService"));
assert.ok(server.includes("adminOperations.getLoginDashboard"));
assert.ok(server.includes("adminOperations.getOpsMetrics"));
assert.ok(server.includes("adminOperations.exportAuditLog"));
assert.ok(server.includes("adminOperations.updateFeedbackEntry"));
assert.ok(adminOperationsService.includes("export function createAdminOperationsService"));
assert.ok(adminOperationsService.includes("export function parseAdminDashboardFilters"));
assert.ok(adminOperationsService.includes("export function getAuditLogRetentionPolicy"));
for (const removedServerNeedle of [
  "auth.getLoginDashboard({",
  "auth.updateFeedbackEntry({",
  "metrics.snapshot({",
]) {
  assert.equal(
    server.includes(removedServerNeedle),
    false,
    `server.mjs should delegate admin operations logic ${removedServerNeedle} to src/server/admin-operations-service.mjs.`,
  );
}
assert.ok(adminOperationsService.includes("auth.getLoginDashboard({"));
assert.ok(adminOperationsService.includes("auth.updateFeedbackEntry({"));
assert.ok(adminOperationsService.includes("metrics.snapshot({"));

assert.ok(boundaryDoc.includes("src/server/auth-http-service.mjs"));
assert.ok(boundaryDoc.includes("Auth HTTP adapter"));
assert.ok(server.includes("createAuthHttpService"));
assert.ok(server.includes("authHttpService.verifyCsrfRequest"));
assert.ok(server.includes("authHttpService.buildClearSessionCookies"));
assert.ok(authHttpService.includes("export function createAuthHttpService"));
assert.ok(authHttpService.includes("export function buildSessionCookie"));
assert.ok(authHttpService.includes("export function verifyCsrfRequest"));
assert.ok(authHttpService.includes("export function shouldUseSecureCookies"));
for (const removedServerNeedle of [
  "function createAuthHandler",
  "function buildSessionCookie",
  "function buildCsrfCookie",
  "function buildClearSessionCookies",
  "function wantsHtmlResponse",
  "function readAuthPayload",
  "function verifyCsrfRequest",
  "function isCsrfExemptPath",
  "function isUnsafeMethod",
  "function getSessionTokens",
  "function getCsrfCookieToken",
  "function getAuthenticatedSession",
  "function getRequestMetadata",
  "export function shouldUseSecureCookies",
  "passwordResetSafeMessage",
]) {
  assert.equal(
    server.includes(removedServerNeedle),
    false,
    `server.mjs should delegate auth HTTP adapter logic ${removedServerNeedle} to src/server/auth-http-service.mjs.`,
  );
}

assert.match(adr, /^# ADR-001: Keep Native HTTP Server And Extract Service Boundaries Incrementally/m);
assert.match(adr, /## Status\s+Accepted/s);
assert.match(adr, /docs\/ARCHITECTURE_BOUNDARIES\.md/);
assert.match(adr, /Future PostgreSQL work should wait/);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
