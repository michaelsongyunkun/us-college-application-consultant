# 生产基础设施大版本发布设计

## 目标

把当前工作区中已经完成的生产基础设施、数据与队列适配、AI 质量、服务边界、前端推荐和安全改动整理为一次可回滚的大提交，在全部可执行质量门禁通过后合并 GitHub `main`，并部署到 Render 服务 `us-college-application-consultant-website`。

“提交前无 Bug”的验收含义是：没有已知未解决缺陷，所有本规格列出的自动化、基础设施、真实 AI 和浏览器验证通过。它不表示能够证明软件绝对不存在未知缺陷。

## 发布边界

### 纳入

- Node/ESM 服务器、Fastify 迁移层、共享 contracts、OpenAPI、仓储适配和可观测性。
- PostgreSQL/Drizzle、Redis/BullMQ、对象存储、Worker、Markdown 入库与迁移脚本。
- Auth、密码重置、数据权利、限流、代理安全、生成任务取消与用户隔离。
- DeepSeek/LangChain/LangGraph、结构化输出、RAG、检索缓存和质量评估。
- 课程、竞赛、夏校、推荐信、资源资格和学校选择等推荐器修复。
- 与上述行为同步的页面脚本、HTML、测试、Docker、Compose、CI、运维和架构文档。
- 课外活动规划 Prompt、Prompt 版本与完整性测试，以及本次发布规格和实施计划。

### 排除

- `.env`、API key、SMTP 凭据、本地 SQLite、日志、备份和私有导出。
- `work/`、`outputs/` 中的临时脚本、原始 AI 输出和评估报告。
- 当前工作树中18份历史 `docs/superpowers/` 规格/计划的删除；远端继续保留这些文档。
- 本次不执行 PostgreSQL 数据迁移、不启用 Redis/BullMQ 生产切换、不改对象存储后端；Render 继续使用已有 SQLite 与本地/内存回退路径。

## Prompt 与生成可靠性修复

在保持15项活动、现有五列表格、叙事模块、模型和创造力参数不变的情况下：

1. 建议年级不得早于用户当前年级；过去年级只可引用用户明确提供的既有经历。
2. 原样保留分数语义，不得把总分改写为单项分、把“正在学习”改写为已考试或已获分。
3. 用户或可审计来源未提供的课程、竞赛、组织、期刊和项目不得写成确定存在；应使用通用类别并标记资格、名称和截止日期待核验。
4. 15项是候选池，不是并行执行清单。前10项按匹配度排列为核心候选，后5项为备选；叙事解读选出不超过4项的起步组合，其总周投入不得超过用户时间预算。
5. 规划调用使用独立的超时预算，避免生产基础设施版本中的全局30秒截止时间截断15项长输出；其他 AI 功能继续使用原有全局策略。

## 运行架构与数据流

- Render 继续从 GitHub `main` 构建并运行 `npm start`。
- 没有 `DATABASE_URL` 时继续使用已有 SQLite 数据库路径，不运行 PostgreSQL cutover。
- 没有 `REDIS_URL` 时生成任务继续使用内存回退，不启动远程 Worker 依赖。
- 没有 S3/R2 配置时继续使用本地对象存储实现。
- Prompt 由服务启动目录中的固定 Markdown 文件读取，SHA-256 和质量元数据版本随发布更新。
- 新 Fastify 层只接管已明确迁移的路由；其他请求继续进入原生 Node 处理器，浏览器契约保持兼容。

## 错误与回滚

- 任何本地门禁失败：停止提交，定位根因并修复，不降低测试标准。
- GitHub CI 任一 job 失败：不合并 `main`。
- Render 构建或启动失败：保持/恢复上一 live deploy `71f94ea`。
- 生产 `/healthz`、`/readyz`、登录或关键页面失败：立即在 Render 回滚到 `71f94ea`，再离线排查。
- 不执行破坏性数据库迁移，因此回滚不需要数据逆迁移。

## 提交策略

- 使用当前分支 `codex/ranking-design-alignment`，只暂存本规格“纳入”范围内的明确文件。
- 在暂存后审查 `git diff --cached --name-status`、敏感文件和删除项。
- 所有门禁通过后创建一次大提交；先推送功能分支并通过 Pull Request 的 quality、security、docker、infrastructure 四个 job，再合并 `main`。
- Render 若未自动部署，使用 Dashboard 的“Deploy latest commit”；不使用“Clear build cache”除非构建证据指向缓存问题。

## 提交前门禁

1. `npm run check`
2. `npm run typecheck`
3. `npm run openapi:check`
4. `npm run prompt:check`
5. `npm run contracts:compat`
6. `npm test`
7. `npm run eval:ai`
8. `npm run eval:retrieval`
9. `npm audit --omit=dev --audit-level=high`
10. Docker runtime 镜像构建
11. `npm run test:infra`，覆盖 PostgreSQL、Redis 重启和 MinIO contracts
12. 使用同一合成学生画像运行真实 DeepSeek Prompt 回归，核对15项、年级、分数语义、外部资源和时间预算
13. 本地桌面约1280px、移动端约390px关键页面冒烟，检查控制台错误、主操作和导航
14. 暂存内容的 secret scan、删除项和路径边界检查

## 上线后验证

- Render deploy 状态为 Live，commit 与合并后的 `main` SHA 一致。
- `https://us-application-consultant.com/healthz` 返回200及健康状态。
- `https://us-application-consultant.com/readyz` 返回200及就绪状态。
- 正式域名首页、登录页和至少一个公开可访问关键页面可加载，无新增控制台错误。
- 检查 Render 部署日志没有新的启动异常、未处理异常或持续5xx。
