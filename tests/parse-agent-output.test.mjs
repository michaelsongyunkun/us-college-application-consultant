import assert from "node:assert/strict";
import { parseAgentOutput } from "../agent-output-parser.mjs";

const sample = `### 输出列表（严格按表格填写）
| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|------|------------------|----------------------|--------------------------------------|----------|
| 1 | 学术突破 | AI教育公益研究 | 问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生 | 10-11 |
| 2 | 社团/领导力 | AI学习社创始人 | 问题：校内AI学习资源分散；成果：组织8次工作坊；影响：成员从6人增至35人 | 10+ |

### 【活动叙事逻辑解读】
以AI教育公益为Spike，形成技术能力与社区影响的闭环。`;

const parsed = parseAgentOutput(sample);

assert.equal(parsed.activities.length, 2);
assert.deepEqual(parsed.activities[0], {
  id: "1",
  type: "学术突破",
  activityName: "AI教育公益研究",
  executionDescription: "问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生",
  suggestedGrade: "10-11",
});
assert.equal(parsed.narrative, "以AI教育公益为Spike，形成技术能力与社区影响的闭环。");
