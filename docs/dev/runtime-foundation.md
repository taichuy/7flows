# Runtime Foundation

## 目标

这次实现的目标不是一次性做完整工作流平台，而是把最关键、最容易成为后续瓶颈的基础设施先落稳：

- 迁移体系替代 `create_all`
- 运行态表结构落地
- 最小可用的工作流执行闭环
- Docker 启动前自动迁移

## 已落地能力

### 1. Alembic 迁移体系

后端已经引入 Alembic，主链路不再依赖应用启动时的 `Base.metadata.create_all()`。

当前文件：

- `api/alembic.ini`
- `api/migrations/env.py`
- `api/migrations/versions/20260309_0001_initial_runtime.py`

当前迁移会创建以下表：

- `workflows`
- `runs`
- `node_runs`
- `run_events`

### 2. Docker 自动迁移

`api` 镜像已增加启动脚本：

- `api/docker/entrypoint.sh`

当环境变量 `SEVENFLOWS_MIGRATION_ENABLED=true` 时，容器启动前会自动执行：

```bash
uv run alembic upgrade head
```

当前约定：

- `api` 服务默认自动迁移
- `worker` 服务默认不自动迁移

这样可以避免多个容器并发升级同一份数据库。

### 3. 运行态模型

当前运行态闭环的核心表如下：

#### `runs`

记录一次工作流执行实例：

- 状态
- 输入
- 输出
- 错误信息
- 起止时间

#### `node_runs`

记录每个节点的一次执行：

- 节点 ID / 名称 / 类型
- 输入输出
- 执行状态
- 错误信息
- 起止时间

#### `run_events`

记录统一事件流，用于后续调试面板、回放和流式输出复用。

当前已记录的事件类型包括：

- `run.started`
- `node.started`
- `node.skipped`
- `node.retrying`
- `node.output.completed`
- `node.context.read`
- `node.join.ready`
- `node.join.unmet`
- `node.failed`
- `run.completed`
- `run.failed`

### 4. 工作流定义校验与版本快照

编排 API 已经补上“最小但真实可用”的设计态约束，避免工作流定义继续以裸 JSON 直接进入运行时。

当前已落地：

- 创建/更新工作流时执行结构校验，至少覆盖：
  - 必须且仅允许一个 `trigger` 节点
  - 至少存在一个 `output` 节点
  - 节点 ID / 连线 ID 唯一
  - 连线引用的源节点和目标节点必须存在
- 设计态约束已继续补强到：
  - `variables` / `publish` 唯一性
  - `tool` 绑定一致性
  - MCP artifact 授权前置校验
  - branch/router 出边条件边界
- 边定义会补齐默认 `channel=control`
- 每次定义变更都会自动创建不可变版本快照
- `runs` 会记录执行时绑定的 `workflow_version`

当前相关文件：

- `api/app/schemas/workflow.py`
- `api/app/services/workflow_definitions.py`
- `api/app/api/routes/workflows.py`
- `api/migrations/versions/20260309_0002_workflow_versioning.py`

当前最小版本管理策略：

- 工作流初始版本为 `0.1.0`
- 仅当 `definition` 发生变更时自动递增 patch 版本，例如 `0.1.0 -> 0.1.1`
- 纯名称修改不会创建新版本
- `workflow_versions` 用于保存不可变快照，供后续运行追溯、发布绑定和缓存失效复用

### 5. 最小工作流执行器

当前执行器位置：

- `api/app/services/runtime.py`

当前实现的是一个 MVP 级执行器，目标是先把“状态、事件、执行记录”打通，而不是完整支持全部节点语义。

当前特性：

- 基于 `nodes + edges` 做拓扑排序
- 检测循环并拒绝执行
- 支持 `trigger`
- 支持 `output`
- 支持基于激活边的条件分支 / 失败分支
- 支持节点级重试策略与退避参数
- 支持节点授权上下文注入与 `mcp_query.authorized_context`
- 支持 `condition` / `router` 通过最小规则选择器按输入命中分支
- 支持 `condition` / `router` 通过安全表达式 `config.expression` 决定分支
- 支持边通过 `conditionExpression` 做安全布尔门控
- 支持节点通过 `runtimePolicy.join` 显式声明多上游 join 约束
- 支持边通过 `mapping[]` 注入字段级输入，并通过 `join.mergeStrategy` 显式解决冲突
- 其他节点默认走统一占位执行逻辑
- 支持通过 `config.mock_output` 为节点声明稳定输出

这让我们可以先验证：

- 工作流是否能跑通
- 运行态是否能完整落库
- 调试与观测数据是否可复用

### 6. 运行 API

当前新增接口：

- `POST /api/workflows/{workflow_id}/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`

用途：

- 触发一次最小工作流执行
- 查询执行详情
- 查询事件流
- 为 AI / 自动化 提供带过滤条件的 run trace 检索
- `GET /api/runs/{run_id}` 当前已支持 `include_events=false` 的摘要模式，供 run 诊断页等人类界面减少与 `/trace` 的重复数据搬运
- 当前 trace 过滤已支持 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序控制
- 当前 trace 还补充了回放 / 导出元信息，例如 trace / returned 时间边界、事件顺序、`replay_offset_ms` 以及 opaque `cursor`

系统诊断相关接口：

- `GET /api/system/overview`
- `GET /api/system/runtime-activity`

用途：

- 提供系统首页和监控入口需要的聚合摘要
- 暴露近期运行态信号，但不承担完整取证日志出口

### 7. 运行态追溯分层

当前仓库已明确把“给人看的诊断面板”和“给 AI / 自动化 看的原始追溯”拆成两层，再加上一层开发过程留痕：

#### L1 人类诊断层

面向：

- 首页系统诊断
- run 诊断面板
- 后续调试工作台

当前接口：

- `GET /api/system/overview`
- `GET /api/system/runtime-activity`
- `GET /api/runs/{run_id}`（供 run 详情页直接展示）

边界：

- 默认展示摘要、统计、预览和跳转入口
- 允许为了可读性做聚合、排序、裁剪和视觉组织
- 不能把 UI 面板本身当成 AI 排障或审计的唯一事实来源

#### L2 机器追溯层

面向：

- AI 开发辅助
- 自动化排障
- 回放与后续机器消费能力

当前接口：

- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`

当前事实载体：

- `runs`
- `node_runs`
- `run_events`

边界：

- 保留原始运行态事实，不按首页展示需求做摘要化截断
- AI / 自动化应优先读取这些接口或底层运行态对象，而不是抓取前端页面文本
- `GET /api/runs/{run_id}/events` 继续保留原始事件列表语义
- `GET /api/runs/{run_id}/trace` 负责提供按 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序过滤的机器检索能力
- `GET /api/runs/{run_id}/trace` 还会补充回放 / 导出所需的派生元信息，但事实来源仍然是同一批 `run_events`
- 若后续机器侧需要更强查询能力，应继续围绕 `run_events` 扩展，而不是继续往首页塞隐藏日志

#### L3 开发留痕层

面向：

- 为什么改
- 改了什么
- 如何验证
- 后续如何接着做

当前载体：

- `docs/dev/`
- 测试与验证结果
- Git 提交历史

边界：

- 这一层记录的是开发过程，不替代运行态日志
- 当 AI 需要追溯“为什么这样实现”时，优先看 `docs/dev/` 和提交，而不是从运行面板反推设计意图

工作流设计态新增接口：

- `POST /api/workflows`
- `PUT /api/workflows/{workflow_id}`
- `GET /api/workflows/{workflow_id}`
- `GET /api/workflows/{workflow_id}/versions`

## 推荐开发命令

### 本地源码模式

```powershell
cd api
Copy-Item .env.example .env
uv sync --extra dev
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Worker:

```powershell
uv run celery -A app.core.celery_app.celery_app worker --loglevel INFO --pool solo
```

### Docker 全栈模式

```powershell
cd docker
Copy-Item .env.example .env
docker compose up -d --build
```

## 当前边界

这次实现故意没有往下做太深，避免把运行时和插件系统搅在一起。

当前还没有实现：

- 通用表达式引擎驱动的 DAG 条件语义
- Loop 节点执行
- 外部 MCP Provider 接入
- 插件兼容代理
- 流式响应映射
- 回放调试面板

## 下一步建议

建议按下面顺序继续：

1. 把 `run_events` 接到前端调试面板
2. 在现有时间范围和 `payload_key` 基础上，继续补导出和回放支撑
3. 把插件管理页和节点配置接到已经持久化的 compat 工具目录
4. 再回头收紧更完整的 `7Flows IR` 校验和发布态版本治理
