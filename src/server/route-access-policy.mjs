import { posix as posixPath } from "node:path";

export const protectedUserPagePaths = Object.freeze([
  "/course-helper.html",
  "/gpa-calculator.html",
  "/my-activities.html",
  "/planning-tracker.html",
  "/school-selection.html",
  "/ask-deepseek.html",
  "/resource-library.html",
  "/school-encyclopedia.html",
  "/university-ranking.html",
  "/major-encyclopedia.html",
]);

const protectedUserPagePathSet = new Set(protectedUserPagePaths);

const publicStaticFilePaths = new Set([
  "/index.html",
  "/contact.html",
  "/disclaimer.html",
  "/feedback.html",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.svg",
  "/styles.css",
]);

const publicStaticDirectoryPrefixes = Object.freeze([
  "/assets/",
  "/src/client/",
  "/src/domain/",
  "/src/shared/",
]);

const protectedDataFilePaths = new Set([
  "/data/admission-cases.md",
  "/data/ap-courses.md",
  "/data/application-round-schools.md",
  "/data/competitions.md",
  "/data/extracurricular-activities.md",
  "/data/international-journals.md",
  "/data/international-schools.md",
  "/data/majors.md",
  "/data/other-region-schools.md",
  "/data/research-projects.md",
  "/data/schools.md",
  "/data/summer-schools.md",
  "/data/university-ranking-data.js",
]);

export function normalizeStaticRequestPath(pathname) {
  if (pathname === "/") return "/index.html";
  if (pathname === "/favicon.ico") return "/favicon.svg";
  try {
    const decoded = decodeURIComponent(pathname).replaceAll("\\", "/");
    const normalized = posixPath.normalize(decoded);
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  } catch {
    return null;
  }
}

export function isKnownStaticRequestPath(requestPath) {
  if (!requestPath) return false;
  if (publicStaticFilePaths.has(requestPath)) return true;
  if (publicStaticDirectoryPrefixes.some((prefix) => requestPath.startsWith(prefix))) return true;
  if (protectedUserPagePathSet.has(requestPath) || requestPath === "/admin.html") return true;
  return protectedDataFilePaths.has(requestPath);
}

export function getStaticRouteAccessPolicy(requestPath) {
  if (requestPath === "/admin.html") {
    return { role: "admin", redirectLocation: "/" };
  }
  if (isProtectedUserPagePath(requestPath)) {
    return { role: "user", redirectLocation: buildLoginRedirectLocation(requestPath) };
  }
  // Keep the authentication gate on every data path, including unknown or
  // sensitive files (for example auth.sqlite). Unknown data files are still
  // rejected by isKnownStaticRequestPath after the gate runs.
  if (requestPath.startsWith("/data/")) {
    return { role: "user", redirectLocation: "" };
  }
  return null;
}

export function isProtectedUserPagePath(requestPath) {
  return protectedUserPagePathSet.has(requestPath);
}

export function isProtectedDataPath(requestPath) {
  return protectedDataFilePaths.has(requestPath);
}

export function buildLoginRedirectLocation(requestPath) {
  return `/?next=${encodeURIComponent(requestPath)}`;
}

export function evaluateRouteAccess(user, { role = "user", redirectLocation = "" } = {}) {
  const isAllowed = role === "admin" ? user?.role === "admin" : Boolean(user);
  if (isAllowed) return { allowed: true, user };

  if (redirectLocation) {
    return { allowed: false, redirectLocation };
  }

  if (role === "admin") {
    return {
      allowed: false,
      statusCode: user ? 403 : 401,
      payload: { error: user ? "Admin access required" : "Not authenticated" },
    };
  }

  return {
    allowed: false,
    statusCode: 401,
    payload: { error: "Not authenticated" },
  };
}

export function buildDeniedAuditEvent({ user = null, audit = null, metadata = {} } = {}) {
  if (!audit) return null;
  return {
    actor: user || null,
    action: audit.action,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId || "",
    outcome: "failure",
    details: {
      reason: user ? "forbidden" : "unauthenticated",
      ...(audit.details || {}),
    },
    metadata,
  };
}
