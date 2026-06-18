import assert from "node:assert/strict";
import {
  buildDeniedAuditEvent,
  buildLoginRedirectLocation,
  evaluateRouteAccess,
  getStaticRouteAccessPolicy,
  isProtectedDataPath,
  isProtectedUserPagePath,
  normalizeStaticRequestPath,
  protectedUserPagePaths,
} from "../src/server/route-access-policy.mjs";

assert.equal(normalizeStaticRequestPath("/"), "/index.html");
assert.equal(normalizeStaticRequestPath("/favicon.ico"), "/favicon.svg");
assert.equal(normalizeStaticRequestPath("/my-activities.html"), "/my-activities.html");
assert.equal(normalizeStaticRequestPath("/data/schools%20copy.md"), "/data/schools copy.md");

for (const pagePath of [
  "/course-helper.html",
  "/gpa-calculator.html",
  "/my-activities.html",
  "/planning-tracker.html",
  "/school-selection.html",
  "/ask-deepseek.html",
  "/resource-library.html",
  "/school-encyclopedia.html",
  "/major-encyclopedia.html",
]) {
  assert.ok(protectedUserPagePaths.includes(pagePath), `${pagePath} should stay in the protected page policy.`);
  assert.equal(isProtectedUserPagePath(pagePath), true);
  assert.deepEqual(getStaticRouteAccessPolicy(pagePath), {
    role: "user",
    redirectLocation: buildLoginRedirectLocation(pagePath),
  });
}

assert.equal(isProtectedUserPagePath("/index.html"), false);
assert.equal(isProtectedDataPath("/data/schools.md"), true);
assert.equal(isProtectedDataPath("/src/client/app.js"), false);
assert.deepEqual(getStaticRouteAccessPolicy("/data/schools.md"), {
  role: "user",
  redirectLocation: "",
});
assert.deepEqual(getStaticRouteAccessPolicy("/admin.html"), {
  role: "admin",
  redirectLocation: "/",
});
assert.equal(getStaticRouteAccessPolicy("/index.html"), null);

const user = { id: 1, role: "user" };
const admin = { id: 2, role: "admin" };

assert.deepEqual(evaluateRouteAccess(user), { allowed: true, user });
assert.deepEqual(evaluateRouteAccess(admin, { role: "admin" }), { allowed: true, user: admin });
assert.deepEqual(evaluateRouteAccess(null), {
  allowed: false,
  statusCode: 401,
  payload: { error: "Not authenticated" },
});
assert.deepEqual(evaluateRouteAccess(null, { redirectLocation: "/?next=%2Fschool-selection.html" }), {
  allowed: false,
  redirectLocation: "/?next=%2Fschool-selection.html",
});
assert.deepEqual(evaluateRouteAccess(user, { role: "admin" }), {
  allowed: false,
  statusCode: 403,
  payload: { error: "Admin access required" },
});
assert.deepEqual(evaluateRouteAccess(null, { role: "admin" }), {
  allowed: false,
  statusCode: 401,
  payload: { error: "Not authenticated" },
});

assert.equal(buildLoginRedirectLocation("/school-selection.html"), "/?next=%2Fschool-selection.html");
assert.equal(buildDeniedAuditEvent(), null);
assert.deepEqual(
  buildDeniedAuditEvent({
    user,
    audit: {
      action: "admin.dashboard.view",
      resourceType: "admin_dashboard",
      details: { filter: "status" },
    },
    metadata: { ipAddress: "127.0.0.1" },
  }),
  {
    actor: user,
    action: "admin.dashboard.view",
    resourceType: "admin_dashboard",
    resourceId: "",
    outcome: "failure",
    details: {
      reason: "forbidden",
      filter: "status",
    },
    metadata: { ipAddress: "127.0.0.1" },
  },
);
