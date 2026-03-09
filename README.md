# 7Flows

7Flows 是一个面向多 Agent 协作的可视化工作流平台。这个仓库已经按 Dify 的本地源码启动思路完成了首版工程初始化：

- `docker/` 负责中间件和整套容器环境
- `api/` 负责编排 API、运行时骨架和 Celery worker
- `web/` 负责前端工作台

当前版本先把“开发体验”和“可扩展基础架构”搭好，便于后续逐步补齐工作流引擎、插件兼容层、沙盒执行和发布网关。

## 目录结构

```text
7flows/
├─ api/                 # FastAPI + Celery
├─ docker/              # Docker Compose 中间件与整套容器编排
├─ docs/                # 产品/技术设计文档
├─ scripts/             # 辅助启动脚本
└─ web/                 # Next.js 前端工作台
```

## 快速开始

### 1. 启动中间件

```powershell
cd docker
Copy-Item middleware.env.example middleware.env
docker compose -f docker-compose.middleware.yaml up -d
```

默认会启动：

- PostgreSQL
- Redis
- RustFS
- Sandbox

默认对外端口已经避开常见本机占用：

- PostgreSQL: `35432`
- Redis: `36379`
- RustFS API: `39000`
- RustFS Console: `39001`
- Sandbox: `38194`

### 2. 启动后端

先确保本机已安装 `uv`。

```powershell
cd api
Copy-Item .env.example .env
uv sync --extra dev
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 启动 Worker

```powershell
cd api
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

### 4. 启动前端

先确保本机已安装 `pnpm`。

```powershell
cd web
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

前端默认地址为 `http://localhost:3000`，后端默认地址为 `http://localhost:8000`。

## 容器化启动

如果你希望直接整体容器化启动：

```powershell
cd docker
Copy-Item .env.example .env
docker compose up -d --build
```

这会启动 `web`、`api`、`worker` 以及依赖中间件。

## 与 Dify 的对齐点

- 目录拆分方式与 Dify 接近，方便后续继续借鉴其源码结构
- 保留“Docker 仅启动依赖，中间件 + 本地源码开发”的流畅路径
- 同时提供“一把梭全容器启动”的补充方案
- 后端预留了运行时、插件代理、沙盒与发布网关的扩展位
- 后端包管理统一为 `uv`，前端包管理统一为 `pnpm`

## 下一步建议

- 补齐数据库迁移与工作流实体
- 落地 `7Flows IR` 的持久化与执行引擎
- 接入 `xyflow` 画布与节点编辑器
- 增加 Dify 插件兼容代理与调试面板
