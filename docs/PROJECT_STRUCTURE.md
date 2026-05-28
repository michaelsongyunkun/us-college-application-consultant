# Project Structure

这个项目是原生 Node.js 服务加静态 HTML/ESM 前端，没有构建打包步骤。文件移动时要同时考虑浏览器 `script` 路径、模块 `import` 路径和测试引用。

## Root

- `server.mjs`: 本地 HTTP 服务入口，负责 API、鉴权、静态文件服务。
- `index.html`, `admin.html`, `*.html`: 浏览器页面入口。
- `styles.css`: 全站样式。
- `package.json`: npm 命令入口。
- `start-consultant.cmd`: Windows 一键启动脚本。

## Source

- `src/client/`: 浏览器端页面脚本、UI 渲染、前端状态和表单收集逻辑。
- `src/domain/`: 可在浏览器或测试中复用的业务逻辑，例如 Agent 输出解析、案例匹配、竞赛/夏校/科研推荐、GPA、Word 导出。
- `src/server/`: 只在 Node 服务端运行的模块，例如认证数据库、认证服务、邮件、API key 解析、规划存储服务。
- `src/shared/`: 前后端都会用到的小型共享工具。

## Data And Content

- `data/*.md`: 应用运行时读取的业务资料库，不属于清理对象。
- `data/auth.sqlite`: 本地运行数据库，已被 `.gitignore` 排除；除非确认要重置本地账号和草稿，否则不要删除。
- `prompts/`: 固定 Agent 提示词，属于核心业务输入。
- `assets/`: 图片等静态素材。

## Tests And Scripts

- `tests/`: 回归测试。
- `scripts/run-tests.mjs`: 自动运行 `tests/*.test.mjs`。
- `scripts/check-syntax.mjs`: 自动对 `server.mjs`、`src/` 和 `scripts/` 下的 JS/MJS 做语法检查。

## Cleanup Rules

- 可以清理空的 `.superpowers/` 本地目录、日志文件和导出的 `*.doc`, `*.docx`, `*.json`。
- 不要把 `node_modules/`、`data/auth.sqlite`、`.env*`、日志或导出文件提交到 Git。
- 不要仅因为文件是 Markdown 就删除 `data/` 或 `prompts/` 内容；它们直接影响应用行为。
