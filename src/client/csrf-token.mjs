const CSRF_COOKIE_NAME = "consultant_csrf";
const CSRF_HEADER_NAME = "X-CSRF-Token";

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

export async function withCsrfHeaders(options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (!isUnsafeMethod(method)) return { ...options, headers };

  let csrfToken = getCsrfTokenFromCookie();
  if (!csrfToken && typeof fetch === "function") {
    await fetch("/api/auth/me", { method: "GET" }).catch(() => null);
    csrfToken = getCsrfTokenFromCookie();
  }
  if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  return { ...options, headers };
}

export async function csrfFetch(url, options = {}) {
  return fetch(url, await withCsrfHeaders(options));
}
