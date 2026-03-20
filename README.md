# 7Flows

7Flows 是一个面向多 Agent 协作的可视化工作流平台。当前项目以 OpenClaw / 本地 AI 助手“黑盒变透明”为切口，对外提供可编排、可调试、可发布、可兼容、可追溯的开源基础能力；对内继续坚持以 `7Flows IR`、runtime、published surface、trace facts 和 compat adapter 作为统一内核，并服务“人”“人 + AI 协作”“AI 自治”三种使用场景下的事实统一、可观察和结果 / 数据一致性。

更多定位说明见 [docs/open-source-positioning.md](/E:/code/taichuCode/7flows/docs/open-source-positioning.md)，授权细节以 [LICENSE](/E:/code/taichuCode/7flows/LICENSE) 为准。

## 当前已落地能力

- 工作流定义已支持最小结构校验、immutable version snapshot 与 compiled blueprint 绑定。
- Runtime 已支持 DAG 调度、条件 / 路由分支、join、edge mapping、waiting / resume、callback ticket、artifact 引用和统一事件落库。
- Published surface 已具备 native / OpenAI / Anthropic 三类入口，以及 API key、缓存、调用审计与最小 SSE。
- 前端工作台已接上 system overview、workflow library、workflow editor、run diagnostics、publish panel、plugin registry、credential store 与 sensitive access inbox 等入口。
- `services/compat-dify` 已提供最小兼容服务骨架，用于承接 `7Flows IR -> Dify invoke payload` 翻译与代理调用。

## 当前诚实边界

- `loop` 节点尚未在 MVP 执行器中正式开放执行。
- 独立的 `SandboxBackendRegistration / SandboxExecution` 协议仍在持续成型，强隔离链路还没有完全闭环。
- 节点配置、发布治理和 operator 工作面已有骨架，但仍在持续补齐，不应误写成完整成品。
- 开源入口文档只说明当前项目能做什么；更细的产品目标设计与技术边界见 `docs/` 下对应文档。

## 仓库结构

```text
7flows/
|- api/           FastAPI、runtime、migrations、published surfaces
|- web/           Next.js 工作台、workflow editor、run diagnostics
|- services/      compat adapter 或独立服务
|- docs/          共享基线、协作索引、ADR
|- .agents/       AI 协作技能与治理资产
|- docker/        中间件 compose 与整套容器 compose
`- scripts/       辅助脚本
```

## 文档与协作入口

建议按下面顺序阅读：

1. [AGENTS.md](/E:/code/taichuCode/7flows/AGENTS.md)
2. 命中目录的 `AGENTS.md`
3. [docs/open-source-positioning.md](/E:/code/taichuCode/7flows/docs/open-source-positioning.md)
4. [docs/product-design.md](/E:/code/taichuCode/7flows/docs/product-design.md)
5. [docs/technical-design-supplement.md](/E:/code/taichuCode/7flows/docs/technical-design-supplement.md)
6. [docs/dev/team-conventions.md](/E:/code/taichuCode/7flows/docs/dev/team-conventions.md)
7. [.agents/skills/README.md](/E:/code/taichuCode/7flows/.agents/skills/README.md)
8. 需要时再读 `docs/.private/` 下当前开发者自己的本地连续性文档

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

### 2. 启动 API

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

### 5. 启动前端

```powershell
cd web
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

### 6. 整套容器启动

```powershell
cd docker
Copy-Item .\.env.example .\.env
docker compose up -d --build
```

## 常用验证

```powershell
cd api
uv run pytest
```

```powershell
cd services/compat-dify
..\..\api\.venv\Scripts\python.exe -m pytest
```

```powershell
cd web
pnpm lint
pnpm test
```
