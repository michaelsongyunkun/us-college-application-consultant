import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppServer } from "../server.mjs";
import { createAuthDatabase } from "../src/server/auth-db.mjs";

const productionOrigin = "https://us-application-consultant.com";

function getTagAttribute(html, selectorPattern, attributeName) {
  const tagMatch = html.match(selectorPattern);
  assert.ok(tagMatch, `Expected tag matching ${selectorPattern}`);
  const attrMatch = tagMatch[0].match(new RegExp(`${attributeName}="([^"]+)"`));
  assert.ok(attrMatch, `Expected ${attributeName} on ${tagMatch[0]}`);
  return attrMatch[1];
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function linearize(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [red, green, blue] = hexToRgb(hex).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function cssVariable(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `Expected --${name} CSS variable`);
  return match[1];
}

const indexHtml = await readFile("index.html", "utf8");

const description = getTagAttribute(indexHtml, /<meta name="description"[^>]+>/, "content");
assert.ok(description.length >= 60);
assert.ok(indexHtml.includes(`<link rel="canonical" href="${productionOrigin}/" />`));
assert.equal(
  getTagAttribute(indexHtml, /<meta property="og:url"[^>]+>/, "content"),
  `${productionOrigin}/`,
);
assert.equal(getTagAttribute(indexHtml, /<meta property="og:type"[^>]+>/, "content"), "website");
assert.ok(getTagAttribute(indexHtml, /<meta property="og:title"[^>]+>/, "content").includes("US College Compass"));
assert.ok(getTagAttribute(indexHtml, /<meta property="og:description"[^>]+>/, "content").length >= 60);
assert.equal(getTagAttribute(indexHtml, /<meta name="twitter:card"[^>]+>/, "content"), "summary");
assert.ok(indexHtml.includes('<meta name="theme-color" content="#fbfaf5" />'));
assert.ok(indexHtml.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />'));
assert.match(
  getTagAttribute(indexHtml, /<link rel="stylesheet"[^>]+>/, "href"),
  /^\.\/styles\.css\?v=[a-z0-9-]+$/u,
);
assert.match(
  getTagAttribute(indexHtml, /<script type="module" src="\.\/src\/client\/app\.js[^"]*"[^>]*>/, "src"),
  /^\.\/src\/client\/app\.js\?v=[a-z0-9-]+$/u,
);
assert.match(
  getTagAttribute(indexHtml, /<script type="module" src="\.\/src\/client\/safe-navigation\.mjs[^"]*"[^>]*>/, "src"),
  /^\.\/src\/client\/safe-navigation\.mjs\?v=[a-z0-9-]+$/u,
);
const authShellTag = indexHtml.match(/<section id="authShell"[^>]*>/)?.[0] || "";
assert.ok(authShellTag, "Home page should include the public auth shell.");
assert.doesNotMatch(
  authShellTag,
  /\bis-hidden\b/u,
  "The public auth shell should be visible even if client modules fail to load.",
);

const robots = await readFile("robots.txt", "utf8");
assert.ok(robots.includes("User-agent: *"));
assert.ok(robots.includes(`Sitemap: ${productionOrigin}/sitemap.xml`));

const sitemap = await readFile("sitemap.xml", "utf8");
assert.ok(sitemap.includes("<urlset"));
assert.ok(sitemap.includes(`<loc>${productionOrigin}/</loc>`));
assert.ok(sitemap.includes(`<loc>${productionOrigin}/contact.html</loc>`));
assert.ok(sitemap.includes(`<loc>${productionOrigin}/disclaimer.html</loc>`));
assert.ok(sitemap.includes(`<loc>${productionOrigin}/feedback.html</loc>`));

const css = await readFile("styles.css", "utf8");
assert.ok(contrastRatio("#ffffff", cssVariable(css, "brand-orange")) >= 4.5);
assert.ok(contrastRatio(cssVariable(css, "brand-green"), cssVariable(css, "surface-green")) >= 4.5);

const tempDir = await mkdtemp(join(tmpdir(), "consultant-production-polish-"));
const authDb = createAuthDatabase({ databasePath: join(tempDir, "auth.sqlite") });
const server = createAppServer({ authDb });

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  for (const publicPath of [
    "/contact.html",
    "/disclaimer.html",
    "/feedback.html",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.svg",
  ]) {
    const response = await fetch(`${baseUrl}${publicPath}`);
    assert.equal(response.status, 200, `${publicPath} should be public`);
  }

  for (const protectedPath of [
    "/course-helper.html",
    "/gpa-calculator.html",
    "/my-activities.html",
    "/school-selection.html",
    "/resource-library.html",
    "/school-encyclopedia.html",
  ]) {
    const response = await fetch(`${baseUrl}${protectedPath}`, { redirect: "manual" });
    assert.equal(response.status, 302, `${protectedPath} should redirect to login`);
    assert.equal(
      response.headers.get("location"),
      `/?next=${encodeURIComponent(protectedPath)}`,
      `${protectedPath} should preserve its return path`,
    );
  }

  for (const protectedPath of [
    "/data/application-round-schools.md",
    "/data/schools.md",
    "/data/international-schools.md",
    "/data/other-region-schools.md",
  ]) {
    const response = await fetch(`${baseUrl}${protectedPath}`);
    assert.equal(response.status, 401, `${protectedPath} should require login`);
  }

  const svgIconResponse = await fetch(`${baseUrl}/favicon.svg`);
  assert.equal(svgIconResponse.headers.get("content-type"), "image/svg+xml;charset=utf-8");

  const legacyFaviconResponse = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(legacyFaviconResponse.status, 200);
  assert.equal(legacyFaviconResponse.headers.get("content-type"), "image/svg+xml;charset=utf-8");

  const stylesheetResponse = await fetch(`${baseUrl}/styles.css`);
  assert.match(stylesheetResponse.headers.get("cache-control") || "", /public, max-age=86400/);

  const moduleResponse = await fetch(`${baseUrl}/src/client/app.js`);
  assert.match(moduleResponse.headers.get("cache-control") || "", /no-cache/);

  const moduleDependencyResponse = await fetch(`${baseUrl}/src/client/ui-state.mjs`);
  assert.match(moduleDependencyResponse.headers.get("cache-control") || "", /no-cache/);

  const htmlResponse = await fetch(`${baseUrl}/`);
  assert.match(htmlResponse.headers.get("cache-control") || "", /no-cache/);

  const headResponse = await fetch(`${baseUrl}/`, { method: "HEAD" });
  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get("cache-control") || "", /no-cache/);
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { recursive: true, force: true });
}
