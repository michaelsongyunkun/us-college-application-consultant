import assert from "node:assert/strict";
import { parseAgentOutput } from "../agent-output-parser.mjs";

const markdownTable = `### 输出列表（严格按表格填写）
| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|------|------------------|----------------------|--------------------------------------|----------|
| 1 | 学术突破 | AI教育公益研究 | 问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生 | 10-11 |
| 2 | 社团/领导力 | AI学习社创始人 | 问题：校内AI学习资源分散；成果：组织8次工作坊；影响：成员从3人增至15人 | 10+ |

### 【活动叙事逻辑解读】
以AI教育公益为Spike，形成技术能力与社区影响的闭环。`;

const parsedMarkdown = parseAgentOutput(markdownTable);
assert.equal(parsedMarkdown.activities.length, 2);
assert.deepEqual(parsedMarkdown.activities[0], {
  id: "1",
  type: "学术突破",
  activityName: "AI教育公益研究",
  executionDescription: "问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生",
  suggestedGrade: "10-11",
});
assert.equal(parsedMarkdown.narrative, "以AI教育公益为Spike，形成技术能力与社区影响的闭环。");

const copiedTable = `序号\t活动类型（Type）\t活动名称（精准描述）\t具体执行描述（需含：问题/成果/影响）\t建议年级
1\t学术突破\t社区空气质量数据研究\t问题：社区缺少长期空气质量记录；成果：完成120天数据采集；影响：形成公开报告\t10-11`;

const parsedCopiedTable = parseAgentOutput(copiedTable);
assert.equal(parsedCopiedTable.activities.length, 1);
assert.equal(parsedCopiedTable.activities[0].activityName, "社区空气质量数据研究");

const loosePipeTable = `1 | 个人兴趣 | 古籍修复学习日志 | 问题：地方文献破损；成果：完成20篇修复记录；影响：制作校内分享材料 | 9-10`;

const parsedLoosePipeTable = parseAgentOutput(loosePipeTable);
assert.equal(parsedLoosePipeTable.activities.length, 1);
assert.equal(parsedLoosePipeTable.activities[0].type, "个人兴趣");

const numberedAnswer = `1. 活动类型（Type）：学术突破
活动名称（精准描述）：城市热岛数据建模
具体执行描述（需含：问题/成果/影响）：问题：校园缺少热岛观测；成果：建模分析30个点位；影响：提交节能建议
建议年级：10-11

2. 活动类型：社团/领导力
活动名称：低碳校园行动小组
具体执行描述：问题：学生节能意识弱；成果：组织6次行动；影响：覆盖300名同学
建议年级：11`;

const parsedNumberedAnswer = parseAgentOutput(numberedAnswer);
assert.equal(parsedNumberedAnswer.activities.length, 2);
assert.equal(parsedNumberedAnswer.activities[1].suggestedGrade, "11");
