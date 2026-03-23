# 7Flows

7Flows 是一个面向多 Agent 协作的可视化工作流平台。当前项目以 OpenClaw / 本地 AI 助手“黑盒变透明”为切口，对外提供可编排、可调试、可发布、可兼容、可追溯的开源基础能力；对内继续坚持以 `7Flows IR`、runtime、published surface、trace facts 和 compat adapter 作为统一内核，并服务“人”“人 + AI 协作”“AI 自治”三种使用场景下的事实统一、可观察和结果 / 数据一致性。

当前 `web/` 工作台首页、`/workflows`、`/runs` 与 `/sensitive-access` 已开始共享同一套跨入口风险摘要，优先把 sandbox readiness、callback recovery automation 和 operator backlog 收成统一 follow-up 视图，减少作者与 operator 在多个入口之间自行拼装主链阻塞事实。workflow library 与 workflow detail publish panel 也继续沿同一条 publish auth 治理链路收口：列表侧可以筛出 legacy publish auth blocker，detail 侧则把历史 legacy draft binding 收成可批量 cleanup 的 backlog，而不是只停留在“知道有问题”的 inventory 提示。

更多定位说明见 [docs/open-source-positioning.md](/E:/code/taichuCode/7flows/docs/open-source-positioning.md)，授权细节以 [LICENSE](/E:/code/taichuCode/7flows/LICENSE) 为准。


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

```shell
cd docker
copy middleware.env.example middleware.env
docker compose -f docker-compose.middleware.yaml up -d
```

默认端口：

- PostgreSQL: `35432`
- Redis: `36379`
- RustFS API: `39000`
- RustFS Console: `39001`
- Sandbox: `38194`

### 2. 启动 API

```shell
cd api
copy .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 启动 Worker

```shell
cd api
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

### 4. 启动 Scheduler

```shell
cd api
uv run celery -A app.core.celery_app.celery_app beat --loglevel INFO
```

### 5. 启动前端

```shell
cd web
copy .env.example .env.local
pnpm install
pnpm dev
```

### 6. 整套容器启动

```shell
cd docker
copy .env.example .env
docker compose up -d --build
```

## 常用验证

```shell
cd api
uv run pytest
```

```shell
cd services/compat-dify
..\..\api\.venv\Scripts\python.exe -m pytest
```

```shell
cd web
pnpm lint
pnpm test
```

## 社区与支持

感谢以下社区的支持与讨论：

- [Linux.do](https://linux.do/)
