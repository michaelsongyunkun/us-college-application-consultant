import { statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

export const staticContentTypes = Object.freeze({
  ".html": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".svg": "image/svg+xml;charset=utf-8",
  ".xml": "application/xml;charset=utf-8",
  ".txt": "text/plain;charset=utf-8",
  ".js": "text/javascript;charset=utf-8",
  ".mjs": "text/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".md": "text/markdown;charset=utf-8",
});

const staticCacheExtensions = new Set([".css", ".svg"]);
const revalidatedCacheExtensions = new Set([".js", ".mjs"]);

export function cacheHeadersForPath(filePath) {
  const extension = extname(filePath);
  if (staticCacheExtensions.has(extension)) {
    return { "Cache-Control": "public, max-age=86400" };
  }
  if (revalidatedCacheExtensions.has(extension)) {
    return { "Cache-Control": "no-cache" };
  }
  if (extension === ".html") {
    return { "Cache-Control": "no-cache" };
  }
  return {};
}

export function resolveStaticFilePath({ root, requestPath, stat = statSync }) {
  const filePath = normalize(join(root, requestPath));
  if (!filePath.startsWith(root)) return null;
  try {
    if (!stat(filePath).isFile()) return null;
  } catch {
    return null;
  }
  return filePath;
}

export function buildStaticResponseHeaders({ filePath, requestPath }) {
  return {
    "Content-Type": staticContentTypes[extname(filePath)] || "text/plain;charset=utf-8",
    ...cacheHeadersForPath(filePath),
    ...(requestPath === "/index.html" ? { Vary: "Cookie" } : {}),
  };
}

export function renderIndexForAuthMode(html, authMode) {
  if (authMode !== "login") return html;
  return html
    .replace(
      '<form id="authForm" class="auth-form" method="post" action="/api/auth/register">',
      '<form id="authForm" class="auth-form" method="post" action="/api/auth/login">',
    )
    .replace('<h2 id="auth-title">领取你的申请行动地图</h2>', '<h2 id="auth-title">登录</h2>')
    .replace('<label id="authNameField">', '<label id="authNameField" class="is-hidden">')
    .replace(
      '<button id="authSubmitButton" type="submit">免费注册并生成规划</button>',
      '<button id="authSubmitButton" type="submit">登录</button>',
    )
    .replace(
      '<button id="forgotPasswordButton" type="button" class="quiet auth-mode-button is-hidden">忘记密码？</button>',
      '<button id="forgotPasswordButton" type="button" class="quiet auth-mode-button">忘记密码？</button>',
    )
    .replace(
      '<a id="authModeButton" href="/?auth=login" class="quiet auth-mode-button">已有账号？登录</a>',
      '<a id="authModeButton" href="/?auth=register" class="quiet auth-mode-button">没有账号？注册</a>',
    );
}

export function renderIndexForSession(html, user, authMode = "register") {
  const renderedHtml = renderIndexForAuthMode(html, authMode);
  if (!user) return renderedHtml;
  return renderedHtml
    .replace(
      '<section id="authShell" class="landing-shell" aria-labelledby="landing-title">',
      '<section id="authShell" class="landing-shell is-hidden" aria-labelledby="landing-title">',
    )
    .replace(
      '<main id="appShell" class="app-shell command-shell is-hidden">',
      '<main id="appShell" class="app-shell command-shell">',
    );
}
