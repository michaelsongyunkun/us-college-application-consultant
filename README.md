# 美本申请规划 Agent

这是一个本地运行的美本申请规划工具。用户填写国际生背景信息后，可以通过 AI 任务包生成 10 项 Common App 课外活动规划，并把结果自动解析进表格。

## 功能

- 用户背景输入：年级、专业方向、核心能力 / 特长、可利用资源、性格 / 行为倾向、兴趣方向、现有课外活动。
- 固定 Agent 提示词：位于 `prompts/us-college-admissions-strategist-agent.md`，请勿篡改。
- DeepSeek 自动生成：由站点服务端统一配置 `DEEPSEEK_API_KEY`，用户无需提供自己的 API Key，一键生成规划回答并写入表格。
- 问DeepSeek：基于学生备份、资源库和院校百科做 RAG 检索问答，帮助核验项目、院校和活动取舍。
- AI 任务包模式：生成任务包给 DeepSeek、ChatGPT 或其他 AI，再粘贴回答并解析进表格。
- 解析诊断：AI 回答未能填入表格时，会显示识别到的候选行、编号段落和可执行修正建议。
- 活动质量检查：自动检查 10 项活动的完整度、数字证据、影响表达、领导力线索和专业连接。
- 导出：支持导出 JSON 和 Word 可打开的 `.doc` 文件。

## 文件结构

- `index.html`：页面结构。
- `styles.css`：页面样式。
- `src/client/app.js`：前端交互、生成任务包、解析回答、导出文件。
- `ask-deepseek.html` / `src/client/ask-deepseek.js`：DeepSeek RAG 问答页面。
- `src/server/deepseek-rag-service.mjs`：学生备份、资源库、院校百科的服务端检索与 DeepSeek 调用。
- `src/client/planning-form-state.mjs`：主页面表单与活动表格的数据采集、回填。
- `src/client/html-utils.mjs`：共享 HTML 转义工具。
- `src/client/agent-answer-diagnostics-ui.mjs`：AI 回答解析诊断面板。
- `src/client/activity-quality-ui.mjs`：活动质量检查面板渲染。
- `server.mjs`：本地服务，读取固定提示词，处理登录、规划存储和资料接口。
- `src/domain/agent-output-parser.mjs`：解析 Agent 输出中的 markdown 表格和【活动叙事逻辑解读】。
- `src/domain/activity-quality-checker.mjs`：检查活动列表质量并生成可执行优化提示。
- `src/domain/codex-mode.mjs`：生成给外部 AI 对话使用的任务包。
- `src/domain/word-export.mjs`：生成 Word 可打开的导出文档。
- `prompts/us-college-admissions-strategist-agent.md`：固定 Agent 提示词。
- `start-consultant.cmd`：Windows 一键启动脚本。
- `tests/`：基础测试。

## 快速启动

重启电脑后，直接双击：

```text
start-consultant.cmd
```

脚本会启动本地服务并打开：

```text
http://127.0.0.1:4179
```

使用页面时，请保持弹出的命令行窗口打开；关闭窗口后，本地网页服务会停止。

不要直接双击 `index.html`，也不要用 `file://` 打开。那样页面无法访问本地服务接口。

## 生成方式

### DeepSeek 自动生成

1. 填写用户背景信息。
2. 点击 `用 DeepSeek 生成规划`。
3. 系统会调用站点统一配置的 DeepSeek API，生成回答后自动解析并写入下方活动表格。

用户不需要输入 API Key。站点所有者需要在启动服务或部署环境中配置 `DEEPSEEK_API_KEY`。

也可以在启动服务前设置环境变量：

```powershell
$env:DEEPSEEK_API_KEY="你的key"
node server.mjs
```

可选模型：

```powershell
$env:DEEPSEEK_MODEL="deepseek-v4-pro"
```

### 问DeepSeek RAG

1. 登录后进入 `问DeepSeek`。
2. 输入关于当前学生、项目资源或院校要求的问题。
3. 系统会先检索学生基础信息、规划版本/历史快照、我的申请档案、资源库和院校百科，再把相关片段发送给 DeepSeek。

该功能同样只使用服务端配置的 `DEEPSEEK_API_KEY`。回答会返回本次使用的参考资料卡片；涉及政策、费用、资格、截止日期和院校要求时，仍需回到官方来源核验。

### AI 任务包模式

1. 填写用户背景信息。
2. 点击 `生成任务包`。
3. 点击 `复制任务包`。
4. 把任务包发给 DeepSeek、ChatGPT 或其他 AI。
5. 把 AI 的完整回答粘贴到 `AI回答粘贴区`。
6. 点击 `解析回答进表格`。

这种方式不调用站内模型 API，不需要用户提供任何 API Key。

## Render 部署配置

如果部署到 Render，并启用 Persistent Disk，推荐配置：

```text
挂载路径：/var/data
```

环境变量：

```text
AUTH_DATABASE_PATH=/var/data/auth.sqlite
APP_BASE_URL=https://us-application-consultant.com
COOKIE_SECURE=true
NODE_ENV=production
```

可选环境变量：

```text
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-pro
```

## GitHub 发布注意事项

不要把任何 API Key、`.env` 文件、日志、导出的 Word/JSON 文件上传到 GitHub。

本项目已提供 `.gitignore`，会忽略：

- `.env` / `.env.*`
- `*.key`
- `api_key.txt`
- `openai_api_key.txt`
- `*.log`
- 导出的 `*.doc` / `*.docx`
- 普通导出的 `*.json`

发布到 GitHub 后，别人下载项目也可以使用：

- DeepSeek 自动生成：由部署环境配置 `DEEPSEEK_API_KEY` 后即可供用户使用。
- AI 任务包模式：无需 API Key。
- 导出 JSON / Word：无需 API Key。

## 找回密码邮件配置

找回密码功能通过 SMTP 发送重置链接。系统不再内置默认发件邮箱；需要启用找回密码时，请显式设置 SMTP 环境变量：

```powershell
$env:SMTP_HOST="smtp.qq.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="your-email@qq.com"
$env:SMTP_PASS="你的 QQ 邮箱 SMTP 授权码"
$env:SMTP_FROM="US College Consultant <your-email@qq.com>"
$env:APP_BASE_URL="http://127.0.0.1:4177"
node server.mjs
```

如果未设置 `SMTP_HOST`、`SMTP_USER` 或 `SMTP_PASS`，找回密码接口仍会返回统一提示，但后台不会发送邮件。`SMTP_FROM` 可省略，系统会默认使用 `US College Consultant <SMTP_USER>`。

重置链接有效期为 30 分钟。为保护账号隐私，找回密码页面不会提示邮箱是否已注册。

## 测试

```powershell
npm test
npm run check
```

## 相似录取案例匹配

- 案例库文件位于 `data/admission-cases.md`，当前由用户提供的 Word 案例文档提取而来，共 57 个案例。
- 每个案例按 `录取`、`专业`、`课程成绩`、`奖项`、`活动` 结构维护。
- 匹配逻辑位于 `src/domain/admission-case-matcher.mjs`，会综合专业方向、学术背景、奖项、活动和目标院校层级计算相似度。
- 后续补充案例时，继续按 `# 案例 58`、`## 录取`、`## 专业`、`## 课程成绩`、`## 奖项`、`## 活动` 的 Markdown 结构追加即可。
- 后续如果升级为数据库、向量库或 RAG 检索，可以保留 `matchAdmissionCases` 的输入输出结构，只替换案例召回层。

## 国际竞赛推荐

- 竞赛资料库文件位于 `data/competitions.md`，当前由用户提供的 Word 竞赛文档提取而来，共 552 条竞赛记录。
- 页面会在“规划回答输出表格”和“相似录取案例参考”之间展示 5 个竞赛推荐：3 个学科强相关、2 个拓展型。
- 推荐逻辑位于 `src/domain/competition-recommender.mjs`，只从 `data/competitions.md` 解析竞赛名称和官网链接；缺少网址的竞赛会显示“官网待确认”。
- 竞赛含金量会在解析时自动评级为 `S / A / B / C`：`S` 对应丘成桐、ISEF、顶级国际奥赛等；`A` 对应 AIME、USACO、John Locke、NEC 等强信号竞赛；`B` 对应 AMC、区域/校际型竞赛；`C` 对应袋鼠数学等入门或体验型竞赛。
- 后续补充竞赛时，继续按 `# 类别名称` 加 `- [竞赛名称](官网链接)` 或 `- 竞赛名称 — 官网以承办机构最新公告为准` 的 Markdown 结构追加即可。

## 夏校推荐

- 夏校资料库文件位于 `data/summer-schools.md`，当前由用户提供的 Word 夏校文档提取而来，共 120 个项目。
- 页面会在“国际竞赛推荐”和“相似录取案例参考”之间展示 3 个夏校推荐：冲刺型、匹配型、保底型各 1 个。
- 推荐逻辑位于 `src/domain/summer-school-recommender.mjs`，会解析项目名称、方向、形式与官网、简介、含金量、录取率、申请要求、举办时间和申请时间。
- 含金量会标准化为主评级，例如 `A+(身份受限)` 会按 `A+` 进入冲刺型梯度。
- 后续补充夏校时，继续按 `# 方向`、`## 序号. 项目名称` 和固定字段的 Markdown 结构追加即可。
