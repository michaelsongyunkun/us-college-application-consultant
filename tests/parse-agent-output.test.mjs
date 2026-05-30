import assert from "node:assert/strict";
import { diagnoseAgentOutput, parseAgentOutput } from "../src/domain/agent-output-parser.mjs";

const markdownTable = `### 输出列表（严格按表格填写）
| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|------|------------------|----------------------|--------------------------------------|----------|
| 1 | 学术突破 | AI教育公益研究 | 问题：乡村学生缺少个性化练习；成果：搭建Python错题分类工具；影响：服务80名学生 | 10-11 |
| 2 | 社团/领导力 | AI学习社创始人 | 问题：校内AI学习资源分散；成果：组织8次工作坊；影响：成员从3人增至15人 | 10+ |

### 【活动叙事逻辑解读】
以AI教育公益为Spike，形成技术能力与社区影响的闭环。`;

const parsedMarkdown = parseAgentOutput(markdownTable);
assert.equal(parsedMarkdown.activities.length, 2);
assert.equal(parsedMarkdown.diagnostics.activityCount, 2);
assert.equal(parsedMarkdown.diagnostics.strategy, "table");
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
assert.equal(parsedCopiedTable.diagnostics.strategy, "table");

const loosePipeTable = `1 | 个人兴趣 | 古籍修复学习日志 | 问题：地方文献破损；成果：完成20篇修复记录；影响：制作校内分享材料 | 9-10`;

const parsedLoosePipeTable = parseAgentOutput(loosePipeTable);
assert.equal(parsedLoosePipeTable.activities.length, 1);
assert.equal(parsedLoosePipeTable.activities[0].type, "个人兴趣");

const markdownFormattedCells = `| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|---|---|---|---|---|
| 1 | 学术突破 | **独立研究：基于NLP的初中生数学错题归因分析模型** | **问题**：发现传统错题本效率低下，无法精准定位知识盲区。**行动**：利用Python爬取Github开源题库及社区论坛文本数据。**成果**：构建分类模型，准确率达82%。 | 10-11 |`;

const parsedMarkdownFormattedCells = parseAgentOutput(markdownFormattedCells);
assert.equal(
  parsedMarkdownFormattedCells.activities[0].activityName,
  "独立研究：基于NLP的初中生数学错题归因分析模型",
);
assert.equal(
  parsedMarkdownFormattedCells.activities[0].executionDescription,
  "问题：发现传统错题本效率低下，无法精准定位知识盲区。行动：利用Python爬取Github开源题库及社区论坛文本数据。成果：构建分类模型，准确率达82%。",
);

const markdownNarrative = `| 序号 | 活动类型（Type） | 活动名称（精准描述） | 具体执行描述（需含：问题/成果/影响） | 建议年级 |
|---|---|---|---|---|
| 1 | 学术突破 | AI教育公益研究 | 问题：乡村学生缺少个性化练习；行动：搭建Python错题分类工具；影响：服务80名学生 | 10-11 |

### 【活动叙事逻辑解读】
### **Spike 定位**
- **主线**：以 AI 教育公益为核心申请叙事。
1. **证据链**：科研、竞赛和社区服务互相支撑。`;

const parsedMarkdownNarrative = parseAgentOutput(markdownNarrative);
assert.equal(
  parsedMarkdownNarrative.narrative,
  "Spike 定位\n主线：以 AI 教育公益为核心申请叙事。\n证据链：科研、竞赛和社区服务互相支撑。",
);

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
assert.equal(parsedNumberedAnswer.diagnostics.strategy, "numbered-blocks");

const plainTextAnswer = `序号 活动类型 (Type) 活动名称 (精准描述) 具体执行描述 (含：问题/成果/影响) 建议年级
1 学术突破 基于物理信息的神经网络(PINN)求解混沌系统（获丘成桐中学科学奖物理奖） 11年级主导研究：发现传统数值方法求解三体问题等混沌系统效率低，利用PyTorch构建PINN模型，将物理定律(如能量守恒)作为损失函数约束项，在10,000个数据点的数据集上训练，将预测误差降低了15%，大幅提升计算效率。论文入围丘成桐科学奖半决赛。 11
2 学术突破 高能物理实验大数据分析（获省级科创赛一等奖） 10-11年级：利用C++分析欧洲核子研究中心(CERN)开放数据，处理50GB质子对撞数据，重建Z玻色子质量峰，并与理论值对比，分析误差来源。该研究获省级青少年科技创新大赛一等奖，展现处理大规模物理数据的能力。 10, 11
3 学术/领导力 校“计算物理”研讨社创始人兼学术主席 10年级发起：针对校内物理社团“重理论、轻计算”的痛点，创建研讨社。设计“C++物理模拟基础”与“机器学习在物理中的应用”两套课程，带领15名成员从零开始，完成双摆混沌运动、恒星内部结构等模拟项目。社团产出的3个小项目获校级优秀项目展示。 10, 11, 12
4 个人兴趣 古典机械装置（如擒纵器、差分机）原理研究与3D建模复原 9-12年级长期兴趣：着迷于18-19世纪精密机械中的物理思想。从研究钟表擒纵机构开始，利用Fusion 360软件进行数字建模和运动仿真，并在3D打印后进行物理实体搭建。完成4件装置的复原模型，并制作系列原理讲解视频，在小破站(B站)等平台累计播放量过万，将复古物理智慧以现代方式传播。 9, 10, 11, 12
5 社团/领导力 “物理科普进社区”公益项目发起人 11年级发起：为解决社区图书馆科普读物陈旧、青少年兴趣低的问题。设计“厨房中的物理学”、“乐器中的声学”等5个主题互动实验包，带领6人团队，在周末为社区儿童开展8场工作坊，直接服务超100人次。项目获社区表彰，并纳入学校常态化志愿服务基地。 11, 12
6 学术竞赛 美国物理碗 (PhysicsBowl) / 英国物理奥林匹克(BPhO) 竞赛 10-11年级持续挑战：在自学AP物理C的基础上，系统性刷题并总结物理模型。在PhysicsBowl中获全球前100名(Division 2)，或在BPhO中获超级金奖，证明自身物理解题能力已达到国际顶尖水平。 10, 11
7 学术夏校 帝国理工学院物理暑期学校项目 10年级暑假：通过严格选拔，参与为期两周的夏校。与全球学生合作，在教授指导下完成“量子计算入门”和“激光干涉测量”两个项目，并在终期展示中获最佳团队协作奖。这不仅是一次学术提升，更是对学术交流能力的证明。 10年级暑假
8 技能拓展 基于C++的物理引擎核心算法复现与优化 9-10年级个人项目：不满足于使用现成游戏引擎，从零开始用C++搭建2D刚体物理引擎。复现碰撞检测、冲量求解等核心算法，并针对大量粒子场景，通过空间哈希算法将计算效率提升20%。项目代码在GitHub上开源，获得50+ star，展示了深厚的底层物理与编程结合的能力。 9, 10
9 学术/写作 创办个人物理科普公众号“熵增定律” 10-12年级：为锻炼科学写作与传播能力，创建个人公众号。每月发布一篇深度文章，如“从麦克斯韦妖看信息熵”、“机器学习为何能发现新物理？”，将复杂的物理概念与前沿科技结合，累计产出30+篇原创文章，吸引超过2000名关注者，形成一个小型线上科学社群。 10, 11, 12
10 领导力/服务 校“朋辈编程导师” (C++方向) 9-10年级：响应学校“数字素养”倡议，担任C++编程助教。为30名编程零基础的同学设计入门教案，通过每周一次的工作坊和线上答疑，在期末帮助80%的学员完成“物理弹球游戏”等结业项目，展现技术领导力与服务精神。 9, 10

【活动叙事逻辑解读】

1. Spike定位：打造 “计算物理新锐” 的申请形象。`;

const parsedPlainText = parseAgentOutput(plainTextAnswer);
assert.equal(parsedPlainText.activities.length, 10);
assert.equal(parsedPlainText.activities[0].activityName, "基于物理信息的神经网络(PINN)求解混沌系统（获丘成桐中学科学奖物理奖）");
assert.equal(parsedPlainText.activities[6].suggestedGrade, "10年级暑假");
assert.equal(parsedPlainText.activities[9].type, "领导力/服务");
assert.match(parsedPlainText.narrative, /计算物理新锐/);
assert.equal(parsedPlainText.diagnostics.strategy, "plain-text-table");
assert.equal(parsedPlainText.diagnostics.narrativeFound, true);

const emptyDiagnostics = diagnoseAgentOutput("");
assert.equal(emptyDiagnostics.activityCount, 0);
assert.equal(emptyDiagnostics.strategy, "none");
assert.match(emptyDiagnostics.issues.join(" "), /粘贴区为空/);

const brokenDiagnostics = diagnoseAgentOutput("序号 活动类型 活动名称 具体执行描述 建议年级\n这里只有表头，没有活动行");
assert.equal(brokenDiagnostics.activityCount, 0);
assert.equal(brokenDiagnostics.evidence.hasTableHeader, true);
assert.ok(brokenDiagnostics.suggestions.some((item) => item.includes("5 列")));
