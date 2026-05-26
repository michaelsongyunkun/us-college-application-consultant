import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const pageHtml = readFileSync("school-encyclopedia.html", "utf8");
const navigation = indexHtml.match(/<nav class="title-link-group"[\s\S]*?<\/nav>/)?.[0] || "";

assert.match(pageHtml, /class="[^"]*brand-page-header[^"]*"/, "School page should use the shared brand header.");
assert.ok(pageHtml.includes('href="./index.html"'), "School page must retain access to the planning workspace.");
assert.ok(
  navigation.indexOf("resource-library.html") < navigation.indexOf("school-encyclopedia.html")
    && navigation.indexOf("school-encyclopedia.html") < navigation.indexOf("disclaimer.html"),
  "院校百科按钮应位于资源库与免责声明之间。",
);
assert.ok(pageHtml.includes('id="schoolSearch"'), "页面应提供院校搜索输入框。");
assert.ok(pageHtml.includes('id="universityTab"') && pageHtml.includes('id="liberalArtsTab"'));
assert.ok(pageHtml.includes('id="schoolList"') && pageHtml.includes('id="schoolStatus"'));
assert.ok(pageHtml.includes('id="loadMoreSchools"'), "院校百科应提供加载更多按钮。");
assert.ok(pageHtml.includes("申请年度官网"), "页面应提示用户核对最新官网要求。");
