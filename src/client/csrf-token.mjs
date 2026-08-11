const CSRF_COOKIE_NAME = "consultant_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_EXEMPT_PATHS = new Set([
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/feedback",
]);

import { requestCurrentAuthSession } from "./auth-session.mjs";

function getDefaultCookieString() {
  return typeof document === "undefined" ? "" : document.cookie || "";
}

function isUnsafeMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

export function getCsrfTokenFromCookie(cookieString = getDefaultCookieString()) {
  const cookie = String(cookieString || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!cookie) return "";
  return decodeURIComponent(cookie.slice(CSRF_COOKIE_NAME.length + 1));
}

export function isCsrfExemptRequestUrl(url) {
  if (!url) return false;
  const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.href;
  return CSRF_EXEMPT_PATHS.has(new URL(url, baseUrl).pathname);
}

export async function withCsrfHeaders(options = {}, url = "") {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (!isUnsafeMethod(method)) return { ...options, headers };
  if (isCsrfExemptRequestUrl(url)) return { ...options, headers };

  let csrfToken = getCsrfTokenFromCookie();
  if (!csrfToken && typeof fetch === "function") {
    await requestCurrentAuthSession().catch(() => null);
    csrfToken = getCsrfTokenFromCookie();
  }
  if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  return { ...options, headers };
}

export async function csrfFetch(url, options = {}) {
  return fetch(url, await withCsrfHeaders(options, url));
}
