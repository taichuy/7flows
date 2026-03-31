# 7Flows

7Flows 是一个面向多 Agent 协作的可视化工作流平台。当前项目以 OpenClaw / 本地 AI 助手“黑盒变透明”为切口，对外提供可编排、可调试、可发布、可兼容、可追溯的开源基础能力；对内继续坚持以 `7Flows IR`、runtime、published surface、trace facts 和 compat adapter 作为统一内核，并服务“人”“人 + AI 协作”“AI 自治”三种使用场景下的事实统一、可观察和结果 / 数据一致性。

当前 `web/` 工作台首页、`/workflows`、`/runs` 与 `/sensitive-access` 已开始共享同一套跨入口风险摘要，优先把 sandbox readiness、callback recovery automation 和 operator backlog 收成统一 follow-up 视图，减少作者与 operator 在多个入口之间自行拼装主链阻塞事实。workflow library、`/workflows/new` 创建向导、editor 保存 workspace starter 后的 sidebar handoff 与 workflow detail publish panel 也继续沿同一条治理链路收口：列表侧不仅可以筛出 legacy auth cleanup backlog，还会把跨 workflow 的 operator checklist 与 governance export artifact 收成统一 handoff 入口；创建页与 editor 保存 starter 反馈会继续显式点名当前 `primary governed starter`，避免作者在 starter -> draft 这一步还得自己倒推刚保存或当前应追踪的是哪一个模板；detail 侧则把历史 legacy draft binding 收成可批量 cleanup 的 backlog，而不是只停留在“知道有问题”的 inventory 提示。当前 published gateway 只承诺 `authMode=api_key` / `authMode=internal`；历史 `token` binding 仅作为 legacy inventory 出现在治理与审计 handoff 中，不再被当作待实现能力暗示支持。

当前也补上了最小 workspace auth 壳层：`/login` 提供本地管理员登录，`/workspace` 提供 Dify 风格的应用工作台入口，`/admin/members` 提供成员新增与角色配置；应用入口仍然回到 7Flows 现有的 xyflow 编排页，而不是分叉成第二套执行心智。

凭据治理主线也继续收口：控制面创建 / 更新 / 吊销凭据时会同步 sensitive resource 与审计活动，而 run detail、callback waiting summary 与 `/sensitive-access` inbox 现已直接消费同一份 `credential governance` 摘要，避免 operator 还要回首页 inventory 才能判断当前 waiting / masked / denied 命中的到底是哪把凭据、处于什么治理级别。

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
   - 如需本地页面 smoke、浏览器操作或截图留证，可继续看 `browser-automation`；当前默认优先 `Playwright CLI / 系统 Chrome`，避免重型 DevTools 常驻会话
8. 需要时再读 `docs/.private/AGENTS.md` 与它指向的当前开发者本地连续性文档

## 本地开发

### 0. 一键启动（Node）

```shell
node scripts/dev-up.js
```

默认会复制缺失的本地环境文件、启动 `docker-compose.middleware.yaml`、执行 API migration，并在后台拉起 API / Worker / Scheduler / Web；日志写入 `tmp/logs/`，Web 默认地址为 `http://localhost:3100`。

如果你想验证本地编译后的 Web 包，而不是 `next dev`，可以显式切到 build 模式：

```shell
node scripts/dev-up.js --web-mode build
```

这个模式会先清理 `web/.next`、执行 `pnpm build`，再用 `next start -p 3100` 拉起编译后的包；其余 API / Worker / Scheduler / Docker 中间件行为保持不变。

如果本机已经有数据库 / Redis 等依赖，或只想重启本地服务而不碰 Docker，可以改用：

```shell
node scripts/dev-up.js --local-only

node scripts/dev-up.js stop --local-only
```

这个模式会继续同步依赖、执行 migration、拉起 API / Worker / Scheduler / Web，但不会启动 Docker，也不会在 `stop` / `pause` 时关闭现有 Docker 中间件；查看状态时可用 `node scripts/dev-up.js status --local-only`。

`node scripts/dev-up.js` 默认会在启动 Web 前清理 `web/.next`，并以 watchpack 轮询模式拉起 `next dev`；如果传入 `--web-mode build`，则会先执行 `pnpm build`，再用 `next start` 拉起本地编译产物。两种模式都会对 `/login`、`/workspace`、`/workflows`、`/workflows/new` 做一次本地作者路由 smoke；`node scripts/dev-up.js status` 也会额外打印这条作者主链的路由健康度、`localhost/127.0.0.1` 的 loopback 结果，并在 shell 代理可能劫持 `127.0.0.1` 时给出显式提示，避免把代理 `502` 误判成前端路由故障。

常用命令：

```shell
node scripts/dev-up.js status
node scripts/dev-pause.js
node scripts/dev-up.js stop
```

如果本地 `chrome-devtools-mcp` 会话积累过多、遗留了旧的 Chrome 子进程，可以先 dry-run 看命中范围，再决定是否清理：

```shell
node scripts/kill-stale-chrome-devtools-mcp.js
node scripts/kill-stale-chrome-devtools-mcp.js --kill
```

如需继续使用 Shell 入口，也可以执行：

```shell
bash scripts/dev-up.sh
bash scripts/dev-up.sh pause
```

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

默认端口：`3100`

### 本地 workspace 默认管理员

- 登录页：`/login`
- 默认管理员邮箱：`admin@taichuy.com`
- 默认管理员密码：`admin123`
- 应用工作台：`/workspace`
- 成员管理：`/admin/members`

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
