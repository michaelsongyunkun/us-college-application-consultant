export const protectedUserPagePaths = Object.freeze([
  "/course-helper.html",
  "/gpa-calculator.html",
  "/my-activities.html",
  "/planning-tracker.html",
  "/school-selection.html",
  "/ask-deepseek.html",
  "/resource-library.html",
  "/school-encyclopedia.html",
  "/major-encyclopedia.html",
]);

const protectedUserPagePathSet = new Set(protectedUserPagePaths);

export function normalizeStaticRequestPath(pathname) {
  if (pathname === "/") return "/index.html";
  if (pathname === "/favicon.ico") return "/favicon.svg";
  return decodeURIComponent(pathname);
}

export function getStaticRouteAccessPolicy(requestPath) {
  if (requestPath === "/admin.html") {
    return { role: "admin", redirectLocation: "/" };
  }
  if (isProtectedUserPagePath(requestPath)) {
    return { role: "user", redirectLocation: buildLoginRedirectLocation(requestPath) };
  }
  if (isProtectedDataPath(requestPath)) {
    return { role: "user", redirectLocation: "" };
  }
  return null;
}

export function isProtectedUserPagePath(requestPath) {
  return protectedUserPagePathSet.has(requestPath);
}

export function isProtectedDataPath(requestPath) {
  return requestPath.startsWith("/data/");
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
