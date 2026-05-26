import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseResearchProjectsMarkdown } from "../research-project-recommender.mjs";

const projects = parseResearchProjectsMarkdown(readFileSync("data/research-projects.md", "utf8"));

assert.equal(projects.length, 21);
assert.deepEqual(projects[0], {
  id: "research-project-1",
  name: "Pioneer Academics",
  tier: "A+ 档",
  rating: "A+",
  recommendation: "⭐⭐⭐⭐⭐ 强烈推荐",
  format: "线上",
  duration: "约 10 周 + Oberlin 学分批准 2-3 月",
  cost: "$8,500（≈ ¥6.2 万）",
  mentorBackground: "Brown / Caltech / Cornell / Vanderbilt 等 Top 50 教授 1v1",
  description: "高中生公认的「科研含金量天花板」，美国 Top 50 教授 1v1 指导，产出真实学术论文 + Oberlin College 3 学分。",
  requirements: "9-11 年级国际高中生；TOEFL 110+ / Duolingo 130+ 或 SAT 1450+；GPA 3.7+；1 封推荐信 + 学术面试；选拔性极高。",
  suitableFor: "高一 / 高二（高三申请窗口已过）；冲刺美本 Top 30 / 港三 / G5；学科覆盖 CS / 数学 / 物理 / 生医 / 人文社科 / 商经。",
  outputs: "论文/出版、推荐信",
  website: "https://pioneeracademics.com",
});
assert.equal(projects.at(-1).name, "Empowerly Research Mentorship");
