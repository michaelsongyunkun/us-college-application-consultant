import assert from "node:assert/strict";
import {
  buildClearSessionCookies,
  buildCsrfCookie,
  buildSessionCookie,
  createAuthHttpService,
  getAppBaseUrl,
  getRequestMetadata,
  getSessionTokens,
  readAuthPayload,
  shouldUseSecureCookies,
  verifyCsrfRequest,
  wantsHtmlResponse,
} from "../src/server/auth-http-service.mjs";

assert.equal(shouldUseSecureCookies({ COOKIE_SECURE: "true" }), true);
assert.equal(shouldUseSecureCookies({ COOKIE_SECURE: "false", NODE_ENV: "production" }), false);
assert.equal(shouldUseSecureCookies({ NODE_ENV: "production" }), true);
assert.equal(shouldUseSecureCookies({ NODE_ENV: "development" }), false);

assert.match(
  buildSessionCookie("session-1", { expiresAt: "2026-06-18T00:00:00.000Z", env: { COOKIE_SECURE: "true" } }),
  /consultant_session=session-1; Path=\/; HttpOnly; SameSite=Lax; Expires=Thu, 18 Jun 2026 00:00:00 GMT; Secure/u,
);
assert.match(
  buildCsrfCookie("csrf-1", { expiresAt: "2026-06-18T00:00:00.000Z", env: {} }),
  /consultant_csrf=csrf-1; Path=\/; SameSite=Lax; Expires=Thu, 18 Jun 2026 00:00:00 GMT/u,
);
assert.deepEqual(
  buildClearSessionCookies({ headers: { host: "app.example.com:443" } }, { env: {} }).map((cookie) =>
    cookie.includes("Domain=app.example.com")
  ),
  [false, false, true, true],
);
assert.deepEqual(getSessionTokens({
  headers: { cookie: "consultant_session=old; theme=light; consultant_session=new" },
}), ["old", "new"]);
assert.deepEqual(getRequestMetadata({
  headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Node Test" },
  socket: { remoteAddress: "127.0.0.1" },
}), {
  userAgent: "Node Test",
  ipAddress: "127.0.0.1",
});
assert.deepEqual(getRequestMetadata({
  headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Proxy Test" },
  socket: { remoteAddress: "127.0.0.1" },
}, { trustProxy: true }), {
  userAgent: "Proxy Test",
  ipAddress: "203.0.113.7",
});
assert.equal(getAppBaseUrl({ headers: { host: "localhost:4177" } }, "https://example.com/"), "https://example.com");
assert.equal(wantsHtmlResponse({ headers: { accept: "text/html" } }), true);
assert.equal(wantsHtmlResponse({ headers: { accept: "text/html, application/json" } }), false);
assert.deepEqual(
  await readAuthPayload(
    { headers: { "content-type": "application/x-www-form-urlencoded" }, text: "email=a%40example.com&password=pw" },
    { readText: async (request) => request.text },
  ),
  { email: "a@example.com", password: "pw" },
);

const calls = [];
const auth = {
  getUserForSession(sessionToken) {
    calls.push(["auth.getUserForSession", sessionToken]);
    return sessionToken === "valid-session" ? { id: 7, email: "student@example.com" } : null;
  },
  verifyCsrfToken(sessionToken, csrfToken) {
    calls.push(["auth.verifyCsrfToken", sessionToken, csrfToken]);
    return sessionToken === "valid-session" && csrfToken === "valid-csrf";
  },
  issueCsrfToken(sessionToken) {
    calls.push(["auth.issueCsrfToken", sessionToken]);
    return "rotated-csrf";
  },
  register(payload, metadata) {
    calls.push(["auth.register", payload, metadata]);
    return {
      user: { id: 8, email: payload.email, role: "user" },
      sessionToken: "registered-session",
      csrfToken: "registered-csrf",
      expiresAt: "2026-06-18T00:00:00.000Z",
    };
  },
  login(payload, metadata) {
    calls.push(["auth.login", payload, metadata]);
    return {
      user: { id: 7, email: payload.email, role: "user" },
      sessionToken: "valid-session",
      csrfToken: "valid-csrf",
      expiresAt: "2026-06-18T00:00:00.000Z",
    };
  },
  logout(sessionToken) {
    calls.push(["auth.logout", sessionToken]);
  },
  createPasswordReset(email) {
    calls.push(["auth.createPasswordReset", email]);
    return {
      user: { email, name: "Student User" },
      resetToken: "reset-token",
      expiresAt: "2026-06-18T01:00:00.000Z",
    };
  },
  resetPassword(payload) {
    calls.push(["auth.resetPassword", payload]);
    return { id: 7, email: "student@example.com" };
  },
  recordAuditEvent(event) {
    calls.push(["auth.recordAuditEvent", event]);
  },
};
const sentMessages = [];
const service = createAuthHttpService({
  auth,
  mailer: {
    async sendPasswordResetEmail(message) {
      sentMessages.push(message);
    },
  },
  appBaseUrl: "https://consultant.example.com/",
  readJson: async (request) => request.payload || {},
  readText: async (request) => request.text || "",
  sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "Content-Type": "application/json;charset=utf-8" });
    response.end(JSON.stringify(payload));
  },
  withSecurityHeaders: (headers = {}) => ({ "X-Content-Type-Options": "nosniff", ...headers }),
  env: {},
});

const loginResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("POST", {
    "content-type": "application/json",
    "user-agent": "Login Test",
    "x-forwarded-for": "198.51.100.9",
  }, {
    email: "student@example.com",
    password: "password123",
  }),
  loginResponse,
  "/api/auth/login",
), true);
assert.equal(loginResponse.statusCode, 200);
assert.match(loginResponse.headers["Set-Cookie"][0], /consultant_session=valid-session/u);
assert.match(loginResponse.headers["Set-Cookie"][1], /consultant_csrf=valid-csrf/u);
assert.deepEqual(JSON.parse(loginResponse.body), {
  user: { id: 7, email: "student@example.com", role: "user" },
  csrfToken: "valid-csrf",
});
assert.deepEqual(calls.find((call) => call[0] === "auth.login"), [
  "auth.login",
  { email: "student@example.com", password: "password123" },
  { userAgent: "Login Test", ipAddress: "127.0.0.1" },
]);

const formLoginResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("POST", {
    accept: "text/html",
    "content-type": "application/x-www-form-urlencoded",
  }, null, "email=form%40example.com&password=password123"),
  formLoginResponse,
  "/api/auth/login",
), true);
assert.equal(formLoginResponse.statusCode, 303);
assert.equal(formLoginResponse.headers.Location, "/");
assert.equal(formLoginResponse.body, "");

const meResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("GET", { cookie: "consultant_session=valid-session; consultant_csrf=stale-csrf" }),
  meResponse,
  "/api/auth/me",
), true);
assert.equal(meResponse.statusCode, 200);
assert.match(meResponse.headers["Set-Cookie"], /consultant_csrf=rotated-csrf/u);
assert.deepEqual(JSON.parse(meResponse.body), {
  user: { id: 7, email: "student@example.com" },
  csrfToken: "rotated-csrf",
});

const csrfBlockedResponse = createResponse();
assert.equal(
  verifyCsrfRequest(
    createRequest("POST", { cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf" }),
    csrfBlockedResponse,
    auth,
    "/api/plans",
    { sendJson: serviceSendJson },
  ),
  false,
);
assert.equal(csrfBlockedResponse.statusCode, 403);
assert.deepEqual(JSON.parse(csrfBlockedResponse.body), { error: "Invalid CSRF token" });

const csrfAllowedResponse = createResponse();
assert.equal(
  service.verifyCsrfRequest(
    createRequest("POST", {
      cookie: "consultant_session=valid-session; consultant_csrf=valid-csrf",
      "x-csrf-token": "valid-csrf",
    }),
    csrfAllowedResponse,
    "/api/plans",
  ),
  true,
);
assert.equal(csrfAllowedResponse.statusCode, 0);

const logoutResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("POST", {
    cookie: "consultant_session=old-session; consultant_session=valid-session",
    "x-csrf-token": "valid-csrf",
  }),
  logoutResponse,
  "/api/auth/logout",
), true);
assert.equal(logoutResponse.statusCode, 200);
assert.equal(logoutResponse.headers["Clear-Site-Data"], '"cookies"');
assert.deepEqual(JSON.parse(logoutResponse.body), { ok: true });
assert.ok(calls.some((call) => call[0] === "auth.logout" && call[1] === "valid-session"));

const resetRequestResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("POST", {}, { email: "student@example.com" }),
  resetRequestResponse,
  "/api/auth/request-password-reset",
), true);
assert.equal(resetRequestResponse.statusCode, 200);
assert.deepEqual(JSON.parse(resetRequestResponse.body), {
  message: "如果邮箱已注册，重置邮件会发送到该邮箱。",
});
assert.deepEqual(sentMessages[0], {
  to: "student@example.com",
  name: "Student User",
  resetUrl: "https://consultant.example.com/?resetToken=reset-token",
  expiresAt: "2026-06-18T01:00:00.000Z",
});

const resetPasswordResponse = createResponse();
assert.equal(await service.handleAuth(
  createRequest("POST", { "user-agent": "Reset Test" }, { token: "reset-token", password: "new-password123" }),
  resetPasswordResponse,
  "/api/auth/reset-password",
), true);
assert.equal(resetPasswordResponse.statusCode, 200);
assert.ok(calls.some((call) =>
  call[0] === "auth.recordAuditEvent" &&
  call[1].action === "auth.password_reset.complete" &&
  call[1].metadata.userAgent === "Reset Test"
));

function createRequest(method, headers = {}, payload = null, text = "") {
  return {
    method,
    headers,
    payload,
    text,
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

function serviceSendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json;charset=utf-8" });
  response.end(JSON.stringify(payload));
}
