import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("index.html", "utf8");
const pageHtml = readFileSync("school-encyclopedia.html", "utf8");
const script = readFileSync("src/client/school-encyclopedia.js", "utf8");
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
assert.ok(pageHtml.includes('id="internationalTab"'), "页面应提供英港澳加新院校分类按钮。");
assert.ok(pageHtml.includes('id="otherRegionTab"'), "页面应提供其他地区院校分类按钮。");
assert.ok(pageHtml.includes("英港澳加新院校"), "院校百科应显示英港澳加新院校分类文案。");
assert.ok(pageHtml.includes("其他地区院校"), "院校百科应显示其他地区院校分类文案。");
assert.ok(pageHtml.includes('id="schoolList"') && pageHtml.includes('id="schoolStatus"'));
assert.ok(pageHtml.includes('id="loadMoreSchools"'), "院校百科应提供加载更多按钮。");
assert.ok(pageHtml.includes("申请年度官网"), "页面应提示用户核对最新官网要求。");
assert.ok(!pageHtml.includes("资料来自"), "院校百科不应展示资料来源说明。");
assert.ok(!script.includes("来源记录"), "院校百科状态不应展示来源记录文案。");
assert.ok(!script.includes("来源资料未提供"), "院校百科空字段不应展示来源文案。");
assert.ok(script.includes('document.querySelector("#internationalTab")'), "前端脚本应绑定英港澳加院校按钮。");
assert.ok(script.includes('document.querySelector("#otherRegionTab")'), "前端脚本应绑定其他地区院校按钮。");
assert.ok(script.includes('fetch("./data/international-schools.md")'), "前端脚本应加载英港澳加院校 RAG 数据。");
assert.ok(script.includes('fetch("./data/other-region-schools.md")'), "前端脚本应加载其他地区院校 RAG 数据。");
assert.ok(script.includes('switchCategory("international")'), "英港澳加按钮应切换到 international 分类。");
assert.ok(script.includes('switchCategory("other-region")'), "其他地区按钮应切换到 other-region 分类。");
assert.ok(script.includes("A-Level / AL"), "英港澳加详情应展示 A-Level / AL 要求。");
assert.ok(script.includes("AP / 美高"), "英港澳加详情应展示 AP / 美高要求。");
assert.ok(script.includes("<dt>IB</dt>"), "英港澳加详情应展示 IB 要求。");
assert.match(
  pageHtml,
  /src="\.\/src\/client\/school-encyclopedia\.js\?v=[a-z0-9-]+"/,
  "院校百科前端脚本应带版本号，避免生产缓存旧逻辑。",
);
assert.match(
  script,
  /from "\.\.\/domain\/school-encyclopedia\.mjs\?v=[a-z0-9-]+"/,
  "院校百科解析模块导入应带版本号，避免生产缓存旧解析器。",
);
