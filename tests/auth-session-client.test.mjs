import assert from "node:assert/strict";

const calls = [];
let authResponse = { ok: false, body: { error: "Not authenticated" } };

globalThis.document = { cookie: "" };
globalThis.window = { location: { href: "https://example.test/" } };
globalThis.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), method: options.method || "GET", headers: options.headers || {} });
  if (url === "/api/auth/me") {
    return {
      ok: authResponse.ok,
      json: async () => authResponse.body,
    };
  }
  return {
    ok: true,
    json: async () => ({ ok: true }),
  };
};

const authSession = await import("../src/client/auth-session.mjs");
const csrfToken = await import("../src/client/csrf-token.mjs");

const [firstSession, secondSession] = await Promise.all([
  authSession.requestCurrentAuthSession(),
  authSession.requestCurrentAuthSession(),
]);
assert.equal(firstSession.ok, false);
assert.equal(secondSession.ok, false);
assert.deepEqual(
  calls.map((call) => call.url),
  ["/api/auth/me"],
  "Concurrent auth session requests should share one /api/auth/me call.",
);

await csrfToken.csrfFetch("/api/auth/register", { method: "POST", body: "{}" });
assert.deepEqual(
  calls.map((call) => call.url),
  ["/api/auth/me", "/api/auth/register"],
  "CSRF-exempt public auth endpoints should not bootstrap /api/auth/me before posting.",
);

await csrfToken.csrfFetch("/api/student-profile", { method: "PUT", body: "{}" });
assert.deepEqual(
  calls.map((call) => call.url),
  ["/api/auth/me", "/api/auth/register", "/api/student-profile"],
  "A cached logged-out auth session should not probe /api/auth/me again for unsafe requests.",
);

authSession.clearCurrentAuthSession();
authResponse = {
  ok: true,
  body: { user: { id: 7, name: "Admin", role: "admin" }, csrfToken: "csrf-7" },
};
const adminSession = await authSession.requestCurrentAuthSession();
assert.equal(adminSession.user.role, "admin");
assert.equal(calls.filter((call) => call.url === "/api/auth/me").length, 2);

authSession.rememberCurrentAuthSession({ id: 8, name: "Fresh Admin", role: "admin" });
const rememberedSession = await authSession.requestCurrentAuthSession();
assert.equal(rememberedSession.user.id, 8);
assert.equal(
  calls.filter((call) => call.url === "/api/auth/me").length,
  2,
  "Remembered login/register sessions should update the auth cache without another /api/auth/me request.",
);
