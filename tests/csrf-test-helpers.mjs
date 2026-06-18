const SESSION_COOKIE_NAME = "consultant_session";
const CSRF_COOKIE_NAME = "consultant_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";

function getCookieValueFromCookieHeader(cookieHeader, cookieName) {
  for (const item of String(cookieHeader || "").split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (rawName === cookieName) return decodeURIComponent(rawValue.join("="));
  }
  return "";
}

export function getCookieValueFromSetCookie(setCookie, cookieName) {
  const pattern = new RegExp(`(?:^|,\\s*)${cookieName}=([^;,\\s]+)`);
  const match = String(setCookie || "").match(pattern);
  return match ? decodeURIComponent(match[1]) : "";
}

export function getCsrfTokenFromCookies(cookies) {
  return (
    getCookieValueFromSetCookie(cookies, CSRF_COOKIE_NAME) ||
    getCookieValueFromCookieHeader(cookies, CSRF_COOKIE_NAME)
  );
}

export function buildCookieHeader(cookies) {
  const sessionToken =
    getCookieValueFromSetCookie(cookies, SESSION_COOKIE_NAME) ||
    getCookieValueFromCookieHeader(cookies, SESSION_COOKIE_NAME);
  const csrfToken = getCsrfTokenFromCookies(cookies);
  return [
    sessionToken ? `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}` : "",
    csrfToken ? `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}` : "",
  ].filter(Boolean).join("; ");
}

export function csrfHeaders(cookies, headers = {}) {
  const cookieHeader = buildCookieHeader(cookies);
  const csrfToken = getCsrfTokenFromCookies(cookies);
  return {
    ...headers,
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    ...(csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {}),
  };
}

export function jsonHeaders(cookies, headers = {}) {
  return csrfHeaders(cookies, { "Content-Type": "application/json", ...headers });
}
