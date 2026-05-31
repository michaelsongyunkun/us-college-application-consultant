import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseExtracurricularActivitiesMarkdown } from "../src/domain/extracurricular-activity-library.mjs";

const sample = `
# Common App 活动类型素材库：29类 x 100种

## 目录

- 01. **Academic（学术）**：100条

## 字段说明

- **活动内容**：可写进活动描述或简历前先用来梳理真实工作。

## 01. Academic（学术）

> 类型定位：开展学术阅读、讨论、写作、展示或同伴学习；突出求知欲、学术表达、批判性思维和自我驱动。

### 001｜长期运营｜论文精读工作坊
- **活动内容**：以长期承诺和固定节奏推进，围绕“论文精读工作坊”开展学术阅读、讨论、写作、展示或同伴学习。
- **活动亮点**：体现耐力、可靠性和时间管理，沉淀文献库和讨论纪要。
- **专业方向**：任意学科、教育学、认知科学、写作

### 002｜领导组织｜学术写作互评小组
- **活动内容**：负责规划、分工、沟通和复盘，围绕“学术写作互评小组”训练论证结构。
- **活动亮点**：体现领导力、项目管理和主动性。
- **专业方向**：英语、历史、哲学、社会科学
`;

const parsedSample = parseExtracurricularActivitiesMarkdown(sample);
assert.equal(parsedSample.length, 2);
assert.deepEqual(
  {
    id: parsedSample[0].id,
    index: parsedSample[0].index,
    commonAppType: parsedSample[0].commonAppType,
    commonAppTypeCn: parsedSample[0].commonAppTypeCn,
    approach: parsedSample[0].approach,
    name: parsedSample[0].name,
    majorDirections: parsedSample[0].majorDirections,
  },
  {
    id: "extracurricular-activity-01-001",
    index: "001",
    commonAppType: "Academic",
    commonAppTypeCn: "学术",
    approach: "长期运营",
    name: "论文精读工作坊",
    majorDirections: ["任意学科", "教育学", "认知科学", "写作"],
  },
);
assert.match(parsedSample[0].categoryPositioning, /学术阅读/);
assert.match(parsedSample[1].highlights, /领导力/);

const fullLibrary = parseExtracurricularActivitiesMarkdown(
  readFileSync("data/extracurricular-activities.md", "utf8"),
);
assert.equal(fullLibrary.length, 2900, "活动库应包含 29 个 Common App 类型 x 100 条素材。");
assert.equal(new Set(fullLibrary.map((activity) => activity.id)).size, 2900, "活动库条目 id 应保持唯一。");
assert.equal(new Set(fullLibrary.map((activity) => activity.category)).size, 29, "活动库应覆盖 29 种 Common App 类型。");
assert.ok(
  fullLibrary.some(
    (activity) =>
      activity.commonAppType === "Robotics"
      && activity.commonAppTypeCn === "机器人"
      && activity.name === "FRC/FTC 机器人队"
      && activity.majorDirections.includes("机械工程"),
  ),
  "活动库应保留 docx 中的 Robotics / FRC/FTC 机器人队素材。",
);
