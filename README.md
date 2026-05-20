# 美本申请规划 Agent

这是一个本地运行的美本申请规划工具。用户填写国际生背景信息后，可以通过两种方式生成 10 项 Common App 课外活动规划，并把结果自动解析进表格。

## 功能

- 用户背景输入：年级、专业方向、核心能力 / 特长、可利用资源、性格 / 行为倾向、兴趣方向、现有课外活动。
- 固定 Agent 提示词：位于 `prompts/us-college-admissions-strategist-agent.md`，请勿篡改。
- API 模式：用户临时输入自己的 OpenAI API Key，一键生成并填入表格。
- Codex 模式：不调用外部 API，生成任务包给 Codex/ChatGPT，再粘贴回答并解析进表格。
- 导出：支持导出 JSON 和 Word 可打开的 `.doc` 文件。

## 文件结构

- `index.html`：页面结构。
- `styles.css`：页面样式。
- `app.js`：前端交互、生成任务包、解析回答、导出文件。
- `server.mjs`：本地服务，读取固定提示词，处理 API 模式请求。
- `agent-output-parser.mjs`：解析 Agent 输出中的 markdown 表格和【活动叙事逻辑解读】。
- `codex-mode.mjs`：生成给 Codex 使用的任务包。
- `word-export.mjs`：生成 Word 可打开的导出文档。
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

## 两种生成方式

### 方式一：Codex 模式（不需要 API Key）

1. 填写用户背景信息。
2. 点击 `生成 Codex 任务包`。
3. 点击 `复制任务包`。
4. 把任务包发给 Codex/ChatGPT。
5. 把 Codex/ChatGPT 的完整回答粘贴到 `Codex 回答粘贴区`。
6. 点击 `解析 Codex 回答进表格`。

这种方式不调用外部 API，不需要用户提供 OpenAI API Key。

### 方式二：API 模式（用户自备 API Key）

1. 填写用户背景信息。
2. 在中间 Agent 层临时粘贴自己的 OpenAI API Key。
3. 点击 `生成并填入表格`。

API Key 只用于本次请求，不保存、不导出。

也可以在启动服务前设置环境变量：

```powershell
$env:OPENAI_API_KEY="你的key"
node server.mjs
```

可选模型：

```powershell
$env:OPENAI_MODEL="gpt-4.1-mini"
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

- Codex 模式：无需 API Key。
- 导出 JSON / Word：无需 API Key。
- API 模式：需要他们自己的 OpenAI API Key。

## 测试

```powershell
node tests\prompt-integrity.test.mjs
node tests\parse-agent-output.test.mjs
node tests\codex-mode.test.mjs
node tests\word-export.test.mjs
node --check app.js
node --check server.mjs
```
