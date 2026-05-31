import assert from "node:assert/strict";
import { buildSvgDocument } from "../src/domain/svg-export.mjs";

const svg = buildSvgDocument({
  profile: {
    grade: "10年级",
    majorDirection: "计算机科学",
    coreStrengths: "数学建模 / NLP",
  },
  activities: [
    {
      id: "1",
      type: "学术突破",
      activityName: "**独立研究：NLP 错题归因模型**",
      executionDescription:
        "**问题**：传统错题本效率低。**行动**：用 Python 分析 5000+ 条文本。**成果**：准确率达到 82%。",
      suggestedGrade: "10-11",
    },
  ],
  narrative: "**主线**：用 AI 解决真实学习问题。",
  competitionRecommendations: [
    {
      name: "Kaggle 教育文本挑战",
      rating: "A-",
      recommendationReason: "与 NLP 和教育数据方向匹配。",
      applicationHelp: "可形成可展示的项目成果。",
      prepTime: "3个月",
      url: "https://example.com",
    },
  ],
});

const overflowRegressionSvg = buildSvgDocument({
  activities: [
    {
      id: "1",
      type: "学术突破",
      activityName: "**独立研究：基于NLP的初中生数学错题归因分析模型**",
      executionDescription:
        "**问题**：发现传统错题本效率低下，无法精准定位知识盲区。**行动**：利用Python爬取Github开源题库及社区论坛中初中生数学错题文本数据（样本量5000+），自学NLP技术进行关键词提取和错误类型聚类分析，构建了一个可自动将错题归因于“概念不清”、“计算失误”、“逻辑错误”等类别的分类模型，准确率达82%。**成果**：撰写20页全英文学术论文，发表干知名预印本网站（如arXiv）或个人独立博客，并尝试投稿至高中生学术期刊。",
      suggestedGrade: "10-11",
    },
  ],
});

assert.match(svg, /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "SVG export should return an SVG document.");
assert.match(svg, /美本申请规划报告/, "SVG export should use a report title.");
assert.match(svg, /10年级/, "SVG export should include student profile fields.");
assert.match(svg, /独立研究：NLP 错题归因模型/, "SVG export should include normalized activity names.");
assert.match(svg, /问题：传统错题本效率低。行动：用 Python/, "SVG export should normalize markdown in activity descriptions.");
assert.match(svg, /活动叙事/, "SVG export should include narrative output.");
assert.match(svg, /国际竞赛推荐/, "SVG export should include recommendation sections.");
assert.doesNotMatch(svg, /\*\*/, "SVG export should not expose markdown syntax.");
assert.doesNotMatch(svg, /<script/i, "SVG export should escape unsafe markup.");

for (const line of extractSvgTextLines(overflowRegressionSvg)) {
  const availableWidth = 1200 - line.x - 52;
  assert.ok(
    estimateRenderedWidth(line.text, line.size) <= availableWidth,
    `SVG line should fit within the report width: ${line.text}`,
  );
}

function extractSvgTextLines(svgText) {
  const lines = [];
  const textPattern = /<text x="([^"]+)"[^>]*font-size="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  for (const textMatch of svgText.matchAll(textPattern)) {
    const [, x, size, body] = textMatch;
    for (const tspanMatch of body.matchAll(/<tspan x="([^"]+)"[^>]*>([\s\S]*?)<\/tspan>/g)) {
      lines.push({
        x: Number(tspanMatch[1] || x),
        size: Number(size),
        text: decodeXml(tspanMatch[2]),
      });
    }
  }
  return lines;
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function estimateRenderedWidth(text, fontSize) {
  return [...text].reduce((width, character) => {
    if (/[\u4e00-\u9fff\u3040-\u30ff\uff00-\uffef]/u.test(character)) return width + fontSize;
    if (/[A-Z0-9]/.test(character)) return width + fontSize * 0.66;
    if (/[a-z]/.test(character)) return width + fontSize * 0.56;
    if (/\s/.test(character)) return width + fontSize * 0.34;
    return width + fontSize * 0.5;
  }, 0);
}
