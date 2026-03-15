# 7Flows

7Flows 是一个面向 OpenClaw / 本地 AI 助手场景切入、面向 agent workflow 演进的可视化执行与治理底座。短期对外先解决“黑盒执行看不清、回放不了、难排障”的问题；对内仍坚持把多节点编排、运行调试、协议发布、插件兼容和运行追溯收敛到同一套 `7Flows IR` 与事件流之上。

它不是 Dify ChatFlow 的复刻，也不是通用低代码平台，更不是单纯的 OpenClaw 皮肤层。当前项目已经超过“只有初始化骨架”的阶段：后端已具备 workflow version / compiled blueprint / runtime / published endpoint / run tracing 等基础事实层，前端也已经接上工作台首页、workflow 新建与最小 `xyflow` 编辑器、run 诊断与发布治理相关入口。

## 当前定位

- 对外传播切口：优先围绕 OpenClaw / 本地 AI 助手“黑盒变透明”的控制面展开，强调执行步骤、工具调用、trace / replay 和错误定位。
- 内部产品内核：继续以 `7Flows IR`、Durable Runtime、发布网关、插件兼容层和统一事件流作为事实中心，而不是把 7Flows 降级成某个上游产品的 UI 包装层。
- 首版只兼容 Dify 插件生态，不承诺兼容完整 Dify ChatFlow DSL、UI 配置格式或整个平台结构。
- OpenClaw 集成边界仍是 `workflow-backed provider`：OpenClaw 对接的是 7Flows 发布网关，而不是直接理解 7Flows 内部 DSL。
- 对外仍按“开源给协作，商业给治理”组织叙事，但仓库授权以根目录 `LICENSE` 为准：当前采用 Apache 2.0 基底 + 附加条件的 `7Flows Community License`，不要把项目误写成纯 `MIT` 或纯 `Apache-2.0`。
- 调试、流式输出、回放优先复用 `run_events`，AI / 自动化 追溯以 `runs`、`node_runs`、`run_events`、`run_artifacts`、`tool_call_records`、`ai_call_records` 为事实来源。
- `llm_agent` 正在按可恢复 phase pipeline 演进，assistant 只负责 evidence 提炼，不拥有流程控制权。

## 开源与商业边界

这部分是当前已经明确的目标设计，不等于仓库已经完整交付对应版本：

- Community / Self-host：`7Flows IR`、runtime、基础执行透明、基础 trace / replay、可视化编排、自部署、插件协议与开发者入口，重点服务真实 adoption、基础协作和 OpenClaw-first 的黑盒透明场景。
- Team：多 workspace、发布治理、团队报表、环境隔离、告警、私有模板库等“小团队控制面”能力。
- Enterprise：组织级治理、审计、预算 / 配额、高级审批、SSO、私有节点仓库、私有部署等能力。
- Managed / Service：官方托管执行、日志 / artifact / queue、SLA、迁移与咨询交付等能力。

当前 Community License 允许个人、团队和单租户自部署场景下的真实使用与二次开发；多租户托管服务、商业化对立面和前端去标识 / 白标分发需要单独商业授权。

## 当前已落地能力

- 工作流定义已支持最小结构校验、immutable version snapshot 与 compiled blueprint 绑定。
- Runtime 已支持拓扑排序、条件/路由分支、join、edge mapping、waiting / resume、callback ticket、artifact 引用和统一事件落库。
- 发布层已具备 native / OpenAI / Anthropic 三类 published surface，以及 API key、缓存、调用审计与最小 SSE 能力。
- 前端工作台已接上 system overview、plugin registry、credential store、workflow library、workspace starters、workflow 编辑入口与 run diagnostics。
- Docker 已同时支持“只启动中间件 + 本地源码开发”和“整套容器启动”两条路径。

## 当前未完成边界

- `loop` 节点尚未在 MVP 执行器中开放执行。
- `WAITING_CALLBACK` 仍缺少后台自动唤醒与完整 scheduler / callback bus。
- 发布网关虽然已拆出多个子模块，但主网关和发布治理仍在持续治理中。
- 节点配置、工作流编辑器和发布治理前端仍处于“可继续扩展”的阶段，不应假装成品已齐全。
- OpenClaw-first 的对外切口已经明确，但仓库当前仍未提供“开箱即用的一键 OpenClaw 会话接管 / demo 套件”；相关接入路径和传播素材仍需继续补齐。

## 仓库结构

```text
7flows/
|- api/           FastAPI、runtime、migrations、tasks、published surfaces
|- web/           Next.js 工作台、workflow editor、run diagnostics
|- docker/        中间件 compose、整套容器 compose、sandbox 配置
|- docs/          产品/技术基线、当前事实索引、历史记录、废弃归档
|- scripts/       辅助脚本
`- services/      预留给兼容层或独立服务
```

文档建议按下面顺序阅读：

1. `AGENTS.md`
2. `docs/product-design.md`
3. `docs/open-source-commercial-strategy.md`
4. `docs/technical-design-supplement.md`
5. `docs/dev/runtime-foundation.md`
6. `docs/dev/user-preferences.md`
7. `docs/history/`
8. `.agents/skills/*/SKILL.md`

## 本地开发

### 1. 启动中间件

```powershell
cd docker
Copy-Item .\middleware.env.example .\middleware.env
docker compose -f .\docker-compose.middleware.yaml up -d
```

默认端口：

- PostgreSQL: `35432`
- Redis: `36379`
- RustFS API: `39000`
- RustFS Console: `39001`
- Sandbox: `38194`

### 2. 启动后端 API

如果仓库里已经有 `api/.venv`，本地开发优先复用它并继续通过 `uv` 作为命令入口。

```powershell
cd api
Copy-Item .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 启动 Worker

```powershell
cd api
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

### 4. 启动 Scheduler

```powershell
cd api
uv run celery -A app.core.celery_app.celery_app beat --loglevel INFO
```

当前 beat 默认会按 `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_INTERVAL_SECONDS` 投递 callback ticket cleanup 任务。

### 5. 启动前端

```powershell
cd web
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:8000`

### 6. 常用验证

```powershell
cd api
uv run pytest
```

```powershell
cd web
pnpm lint
```

## 容器化启动

如果希望直接跑整套容器：

```powershell
cd docker
Copy-Item .\.env.example .\.env
docker compose up -d --build
```

整套容器模式下，`api` 容器会在启动前自动执行数据库迁移。

## 关键接口与界面现状

- API 当前已提供 health、workflows、workflow publish、published gateway、runs、run views、system overview、plugins、credentials、workspace starters 等主干路由。
- Web 首页当前更偏“工作台 / 诊断入口”，会展示服务健康、adapter、tools、workflow、credentials、recent runs、敏感访问审批摘要与 run events 聚合摘要。
- `web/app/sensitive-access/page.tsx` 已提供最小审批 / 通知收件箱入口，可查看 `ApprovalTicket / NotificationDispatch` 并直接做批准 / 拒绝决策。
- The minimal workflow editor can already edit and save workflow definitions. Structured forms now cover `runtimePolicy.execution / retry / join`, node `input/output schema`, and workflow `publish` draft configuration, while formal publish governance, approval timeline, and notification delivery are still being filled in.

## 文档分层

- `docs/product-design.md`：产品定位、IR、节点体系、发布模型、前端骨架。
- `docs/open-source-commercial-strategy.md`：OpenClaw-first 对外切口、开源/商业边界、版本分层和传播/付费对象。
- `docs/technical-design-supplement.md`：插件兼容、插件 UI、安全、变量传递、调试模式、缓存、Durable Runtime 细节。
- `docs/dev/runtime-foundation.md`：当前代码事实、结构热点、近期优先级。
- `docs/dev/user-preferences.md`：稳定用户偏好与长期协作约束。
- `docs/.taichuy/`：本地开发设计讨论素材和文案草稿，默认不进 Git，也不作为仓库事实基线。
- `docs/history/`：按日期归档的开发记录、阶段性方案与验证留痕。
- `docs/expired/`：已废弃但保留历史价值的文档。

## AI 协作与 Skills

- `.agents/skills/development-closure`：一轮开发收尾时的验证、文档同步、提交与下一步规划闭环。
- `.agents/skills/skill-governance`：优化 skill、AGENTS 规则和 AI 协作流程时的分层与索引治理。
- `.agents/skills/backend-code-review`：后端 review、运行时、迁移、发布接口、插件代理与安全边界审查。
- `.agents/skills/backend-testing`：后端测试设计、补测、runtime 与 published surface 行为验证。
- `.agents/skills/frontend-code-review`：前端页面、组件、工作流编辑器、调试和发布界面审查。
- `.agents/skills/component-refactoring`：复杂 React 组件、配置面板、调试面板和编辑器壳层拆分。
- `.agents/skills/frontend-testing`：前端测试设计、补测和测试基础设施判断。
- `.agents/skills/orpc-contract-first`：只有在明确引入 oRPC 合同优先 API 层时才启用。
- AI 协作开发默认先判断是否需要“元流程 skill + 领域 skill”组合，再结合 `docs/dev/runtime-foundation.md` 和产品/技术/策略基线落地。

## 当前优先级

当前研发优先级以 `docs/dev/runtime-foundation.md` 为准，当前摘要如下：

1. 继续把 graded execution 从 execution-aware 扩成真实隔离能力。
2. 定义并落地统一敏感访问控制闭环，同时补齐 `WAITING_CALLBACK` 的后台唤醒主链。
3. 继续治理插件兼容、工作流 schema、run diagnostics、publish streaming 和编辑器结构热点。
4. 把“开源给协作、商业给治理”的边界继续收敛成可实现的领域模型，避免实现与对外叙事再次混线。
