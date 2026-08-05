import assert from "node:assert/strict";
import { join, sep } from "node:path";
import {
  buildStaticResponseHeaders,
  cacheHeadersForPath,
  renderIndexForAuthMode,
  renderIndexForSession,
  resolveStaticFilePath,
  staticContentTypes,
} from "../src/server/static-file-service.mjs";

assert.equal(staticContentTypes[".html"], "text/html;charset=utf-8");
assert.equal(staticContentTypes[".svg"], "image/svg+xml;charset=utf-8");
assert.equal(staticContentTypes[".md"], "text/markdown;charset=utf-8");

assert.deepEqual(cacheHeadersForPath("styles.css"), { "Cache-Control": "public, max-age=86400" });
assert.deepEqual(cacheHeadersForPath("favicon.svg"), { "Cache-Control": "public, max-age=86400" });
assert.deepEqual(cacheHeadersForPath("src/client/app.js"), { "Cache-Control": "no-cache" });
assert.deepEqual(cacheHeadersForPath("src/client/app.mjs"), { "Cache-Control": "no-cache" });
assert.deepEqual(cacheHeadersForPath("index.html"), { "Cache-Control": "no-cache" });
assert.deepEqual(cacheHeadersForPath("data/schools.md"), {});

const root = join(process.cwd(), "static-root") + sep;
const indexPath = join(root, "index.html");
assert.equal(
  resolveStaticFilePath({
    root,
    requestPath: "/index.html",
    stat: (filePath) => {
      if (filePath !== indexPath) throw new Error("missing");
      return { isFile: () => true };
    },
  }),
  indexPath,
);
assert.equal(
  resolveStaticFilePath({
    root,
    requestPath: "/missing.html",
    stat: () => {
      throw new Error("missing");
    },
  }),
  null,
);
assert.equal(
  resolveStaticFilePath({
    root,
    requestPath: "/../static-root-sibling/secret.txt",
    stat: () => ({ isFile: () => true }),
  }),
  null,
);
assert.equal(
  resolveStaticFilePath({
    root,
    requestPath: "/../secrets.txt",
    stat: () => ({ isFile: () => true }),
  }),
  null,
);
assert.equal(
  resolveStaticFilePath({
    root,
    requestPath: "/assets/",
    stat: () => ({ isFile: () => false }),
  }),
  null,
);

assert.deepEqual(buildStaticResponseHeaders({ filePath: indexPath, requestPath: "/index.html" }), {
  "Content-Type": "text/html;charset=utf-8",
  "Cache-Control": "no-cache",
  Vary: "Cookie",
});
assert.deepEqual(
  buildStaticResponseHeaders({ filePath: join(root, "src", "client", "app.js"), requestPath: "/src/client/app.js" }),
  {
    "Content-Type": "text/javascript;charset=utf-8",
    "Cache-Control": "no-cache",
  },
);
assert.deepEqual(buildStaticResponseHeaders({ filePath: join(root, "README.unknown"), requestPath: "/README.unknown" }), {
  "Content-Type": "text/plain;charset=utf-8",
});

const indexHtml = [
  '<form id="authForm" class="auth-form" method="post" action="/api/auth/register">',
  '<h2 id="auth-title">领取你的申请行动地图</h2>',
  '<label id="authNameField">',
  '<button id="authSubmitButton" type="submit">免费注册并生成规划</button>',
  '<button id="forgotPasswordButton" type="button" class="quiet auth-mode-button is-hidden">忘记密码？</button>',
  '<a id="authModeButton" href="/?auth=login" class="quiet auth-mode-button">已有账号？登录</a>',
  '<section id="authShell" class="landing-shell" aria-labelledby="landing-title">',
  '<main id="appShell" class="app-shell command-shell is-hidden">',
].join("\n");

const loginHtml = renderIndexForAuthMode(indexHtml, "login");
assert.match(loginHtml, /action="\/api\/auth\/login"/);
assert.match(loginHtml, /<h2 id="auth-title">登录<\/h2>/);
assert.match(loginHtml, /<label id="authNameField" class="is-hidden">/);
assert.match(loginHtml, />没有账号？注册<\/a>/);

assert.equal(renderIndexForAuthMode(indexHtml, "register"), indexHtml);

const authenticatedHtml = renderIndexForSession(indexHtml, { id: 1 }, "register");
assert.match(authenticatedHtml, /<section id="authShell" class="landing-shell is-hidden"/);
assert.match(authenticatedHtml, /<main id="appShell" class="app-shell command-shell">/);
assert.equal(renderIndexForSession(indexHtml, null, "register"), indexHtml);
