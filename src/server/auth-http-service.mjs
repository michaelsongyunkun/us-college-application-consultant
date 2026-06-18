export const DEFAULT_SESSION_COOKIE_NAME = "consultant_session";
export const DEFAULT_CSRF_COOKIE_NAME = "consultant_csrf";
export const DEFAULT_CSRF_HEADER_NAME = "x-csrf-token";

const DEFAULT_PASSWORD_RESET_SAFE_MESSAGE =
  "如果邮箱已注册，重置邮件会发送到该邮箱。";

export function createAuthHttpService({
  auth,
  mailer,
  appBaseUrl = "",
  readJson,
  readText,
  sendJson,
  withSecurityHeaders = (headers = {}) => headers,
  env = process.env,
  passwordResetSafeMessage = DEFAULT_PASSWORD_RESET_SAFE_MESSAGE,
  cookieNames = {},
  csrfHeaderName = DEFAULT_CSRF_HEADER_NAME,
} = {}) {
  const sessionCookieName = cookieNames.session || DEFAULT_SESSION_COOKIE_NAME;
  const csrfCookieName = cookieNames.csrf || DEFAULT_CSRF_COOKIE_NAME;
  const cookieOptions = { env, sessionCookieName, csrfCookieName };

  async function handleAuth(request, response, pathname) {
    if (request.method === "GET" && pathname === "/api/auth/me") {
      const session = getAuthenticatedSession(request, auth, { sessionCookieName });
      if (!session) {
        sendJson(response, 401, { error: "Not authenticated" });
        return true;
      }
      const csrfCookieToken = getCsrfCookieToken(request, { csrfCookieName });
      const csrfToken = auth.verifyCsrfToken(session.sessionToken, csrfCookieToken)
        ? csrfCookieToken
        : auth.issueCsrfToken(session.sessionToken);
      response.writeHead(200, withSecurityHeaders({
        ...(csrfToken ? { "Set-Cookie": buildCsrfCookie(csrfToken, cookieOptions) } : {}),
        "Content-Type": "application/json;charset=utf-8",
      }));
      response.end(JSON.stringify({ user: session.user, csrfToken }));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/register") {
      const result = auth.register(await readAuthPayload(request, { readJson, readText }), getRequestMetadata(request));
      sendAuthSessionResponse(request, response, result, { withSecurityHeaders, cookieOptions });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const result = auth.login(await readAuthPayload(request, { readJson, readText }), getRequestMetadata(request));
      sendAuthSessionResponse(request, response, result, { withSecurityHeaders, cookieOptions });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/logout") {
      for (const sessionToken of getSessionTokens(request, { sessionCookieName })) {
        auth.logout(sessionToken);
      }
      const logoutHeaders = {
        "Set-Cookie": buildClearSessionCookies(request, cookieOptions),
        "Clear-Site-Data": '"cookies"',
      };
      if (wantsHtmlResponse(request)) {
        response.writeHead(303, withSecurityHeaders({
          ...logoutHeaders,
          Location: "/",
        }));
        response.end();
        return true;
      }
      response.writeHead(200, withSecurityHeaders({
        ...logoutHeaders,
        "Content-Type": "application/json;charset=utf-8",
      }));
      response.end(JSON.stringify({ ok: true }));
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/request-password-reset") {
      const payload = await readJson(request);
      try {
        const result = auth.createPasswordReset(payload.email);
        if (result) {
          const resetUrl = `${getAppBaseUrl(request, appBaseUrl)}/?resetToken=${encodeURIComponent(
            result.resetToken,
          )}`;
          await mailer.sendPasswordResetEmail({
            to: result.user.email,
            name: result.user.name,
            resetUrl,
            expiresAt: result.expiresAt,
          });
        }
      } catch (error) {
        console.error("Password reset request failed:", error.message);
      }
      sendJson(response, 200, { message: passwordResetSafeMessage });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/auth/reset-password") {
      const payload = await readJson(request);
      const user = auth.resetPassword({
        resetToken: payload.token,
        password: payload.password,
      });
      auth.recordAuditEvent({
        actor: user,
        action: "auth.password_reset.complete",
        resourceType: "user_account",
        resourceId: user.id,
        metadata: getRequestMetadata(request),
      });
      sendJson(response, 200, { user });
      return true;
    }

    return false;
  }

  function verifyCsrfRequestForAuthService(request, response, pathname) {
    return verifyCsrfRequest(request, response, auth, pathname, {
      csrfHeaderName,
      csrfCookieName,
      sessionCookieName,
      sendJson,
    });
  }

  return {
    handleAuth,
    verifyCsrfRequest: verifyCsrfRequestForAuthService,
    getAuthenticatedSession: (request) => getAuthenticatedSession(request, auth, { sessionCookieName }),
    getUserForRequest: (request) => getUserForRequest(request, auth, { sessionCookieName }),
    getSessionTokens: (request) => getSessionTokens(request, { sessionCookieName }),
    getCsrfCookieToken: (request) => getCsrfCookieToken(request, { csrfCookieName }),
    buildClearSessionCookies: (request) => buildClearSessionCookies(request, cookieOptions),
  };
}

export function buildSessionCookie(sessionToken, {
  expiresAt,
  env = process.env,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
} = {}) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (expiresAt) parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  if (shouldUseSecureCookies(env)) parts.push("Secure");
  return parts.join("; ");
}

export function buildCsrfCookie(csrfToken, {
  expiresAt,
  env = process.env,
  csrfCookieName = DEFAULT_CSRF_COOKIE_NAME,
} = {}) {
  const parts = [
    `${csrfCookieName}=${encodeURIComponent(csrfToken)}`,
    "Path=/",
    "SameSite=Lax",
  ];
  if (expiresAt) parts.push(`Expires=${new Date(expiresAt).toUTCString()}`);
  if (shouldUseSecureCookies(env)) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie({
  domain,
  env = process.env,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
} = {}) {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (shouldUseSecureCookies(env)) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCsrfCookie({
  domain,
  env = process.env,
  csrfCookieName = DEFAULT_CSRF_COOKIE_NAME,
} = {}) {
  const parts = [
    `${csrfCookieName}=`,
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (domain) parts.push(`Domain=${domain}`);
  if (shouldUseSecureCookies(env)) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookies(request, {
  env = process.env,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
  csrfCookieName = DEFAULT_CSRF_COOKIE_NAME,
} = {}) {
  const host = (request.headers.host || "").split(":")[0].toLowerCase();
  const cookies = [
    buildClearSessionCookie({ env, sessionCookieName }),
    buildClearCsrfCookie({ env, csrfCookieName }),
  ];
  const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/u.test(host);
  if (host && host !== "localhost" && host.includes(".") && !isIpAddress) {
    cookies.push(buildClearSessionCookie({ domain: host, env, sessionCookieName }));
    cookies.push(buildClearCsrfCookie({ domain: host, env, csrfCookieName }));
  }
  return cookies;
}

export function getSessionTokens(request, {
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
} = {}) {
  return getCookieValues(request, sessionCookieName).filter(Boolean);
}

export function getCsrfCookieToken(request, {
  csrfCookieName = DEFAULT_CSRF_COOKIE_NAME,
} = {}) {
  return getCookieValues(request, csrfCookieName).filter(Boolean).at(-1) || "";
}

export function getAuthenticatedSession(request, auth, options = {}) {
  const sessionTokens = getSessionTokens(request, options);
  for (let index = sessionTokens.length - 1; index >= 0; index -= 1) {
    const sessionToken = sessionTokens[index];
    const user = auth.getUserForSession(sessionToken);
    if (user) return { user, sessionToken };
  }
  return null;
}

export function getUserForRequest(request, auth, options = {}) {
  return getAuthenticatedSession(request, auth, options)?.user || null;
}

export function getRequestMetadata(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const ipAddress = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim() || request.socket?.remoteAddress || "";
  return {
    userAgent: request.headers["user-agent"] || "",
    ipAddress,
  };
}

export function wantsHtmlResponse(request) {
  const accept = request.headers.accept || "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

export async function readAuthPayload(request, { readJson, readText } = {}) {
  const contentType = request.headers["content-type"] || "";
  if (contentType.toLowerCase().includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(await readText(request)));
  }
  return readJson(request);
}

export function getAppBaseUrl(request, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
  return `${protocol}://${request.headers.host}`;
}

export function shouldUseSecureCookies(env = process.env) {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  return env.NODE_ENV === "production";
}

export function isUnsafeMethod(method) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

export function isCsrfExemptPath(pathname) {
  return [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/feedback",
  ].includes(pathname);
}

export function verifyCsrfRequest(request, response, auth, pathname, {
  csrfHeaderName = DEFAULT_CSRF_HEADER_NAME,
  sessionCookieName = DEFAULT_SESSION_COOKIE_NAME,
  csrfCookieName = DEFAULT_CSRF_COOKIE_NAME,
  sendJson,
} = {}) {
  if (!isUnsafeMethod(request.method) || !pathname.startsWith("/api/") || isCsrfExemptPath(pathname)) {
    return true;
  }

  let hasValidSession = false;
  const headerToken = String(request.headers[csrfHeaderName] || request.headers[csrfHeaderName.toLowerCase()] || "");
  const cookieToken = getCsrfCookieToken(request, { csrfCookieName });
  for (const sessionToken of [...getSessionTokens(request, { sessionCookieName })].reverse()) {
    const user = auth.getUserForSession(sessionToken);
    if (!user) continue;
    hasValidSession = true;
    if (
      headerToken &&
      cookieToken &&
      headerToken === cookieToken &&
      auth.verifyCsrfToken(sessionToken, headerToken)
    ) {
      return true;
    }
  }

  if (!hasValidSession) return true;
  sendJson(response, 403, { error: "Invalid CSRF token" });
  return false;
}

function sendAuthSessionResponse(request, response, result, { withSecurityHeaders, cookieOptions }) {
  const headers = {
    "Set-Cookie": [
      buildSessionCookie(result.sessionToken, { ...cookieOptions, expiresAt: result.expiresAt }),
      buildCsrfCookie(result.csrfToken, { ...cookieOptions, expiresAt: result.expiresAt }),
    ],
  };
  if (wantsHtmlResponse(request)) {
    response.writeHead(303, withSecurityHeaders({
      ...headers,
      Location: "/",
    }));
    response.end();
    return;
  }
  response.writeHead(200, withSecurityHeaders({
    ...headers,
    "Content-Type": "application/json;charset=utf-8",
  }));
  response.end(JSON.stringify({ user: result.user, csrfToken: result.csrfToken }));
}

function getCookieValues(request, cookieName) {
  const values = [];
  const cookieHeader = request.headers.cookie || "";
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName !== cookieName) continue;
    values.push(decodeURIComponent(rawValue.join("=")));
  }
  return values;
}
