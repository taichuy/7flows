# 7Flows

7Flows 是一个面向多 Agent 协作的可视化工作流平台，核心目标是把多节点编排、运行调试、协议发布、插件兼容和运行追溯收敛到同一套 `7Flows IR` 与事件流之上。

它不是 Dify ChatFlow 的复刻，也不是通用低代码平台。当前项目已经超过“只有初始化骨架”的阶段：后端已具备 workflow version / compiled blueprint / runtime / published endpoint / run tracing 等基础事实层，前端也已经接上工作台首页、workflow 新建与最小 `xyflow` 编辑器、run 诊断与发布治理相关入口。

## 当前定位

- 内部统一以 `7Flows IR` 作为事实模型，外部协议只通过适配层映射。
- 首版只兼容 Dify 插件生态，不承诺兼容完整 Dify ChatFlow DSL、UI 配置格式或整个平台结构。
- 调试、流式输出、回放优先复用 `run_events`，AI / 自动化 追溯以 `runs`、`node_runs`、`run_events`、`run_artifacts`、`tool_call_records`、`ai_call_records` 为事实来源。
- `llm_agent` 正在按可恢复 phase pipeline 演进，assistant 只负责 evidence 提炼，不拥有流程控制权。

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
3. `docs/technical-design-supplement.md`
4. `docs/dev/runtime-foundation.md`
5. `docs/dev/user-preferences.md`
6. `docs/history/`

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
- Web 首页当前更偏“工作台 / 诊断入口”，会展示服务健康、adapter、tools、workflow、credentials、recent runs 与 run events 聚合摘要。
- The minimal workflow editor can already edit and save workflow definitions. Structured forms now cover `runtimePolicy.execution / retry / join`, node `input/output schema`, and workflow `publish` draft configuration, while formal publish governance and sensitive-access policy UI are still being filled in.

## 文档分层

- `docs/product-design.md`：产品定位、IR、节点体系、发布模型、前端骨架。
- `docs/technical-design-supplement.md`：插件兼容、插件 UI、安全、变量传递、调试模式、缓存、Durable Runtime 细节。
- `docs/dev/runtime-foundation.md`：当前代码事实、结构热点、近期优先级。
- `docs/dev/user-preferences.md`：稳定用户偏好与长期协作约束。
- `docs/history/`：按日期归档的开发记录、阶段性方案与验证留痕。
- `docs/expired/`：已废弃但保留历史价值的文档。

## 当前优先级

1. 持续拆分 `api/app/services/published_gateway.py`，避免协议映射与审计逻辑回流主网关。
2. 持续治理 `api/app/services/runtime.py`，沿 graph scheduling / lifecycle / resume orchestration 拆边界。
3. 继续治理 `web/components/run-diagnostics-panel.tsx`，保持摘要优先、详情可钻取。
4. Continue filling in sensitive-access policy placement, variables/schema builder, and a clearer advanced-JSON vs structured-form boundary so the editor can keep moving toward the main product workflow.
