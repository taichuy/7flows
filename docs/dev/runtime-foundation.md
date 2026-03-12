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
- `api/migrations/versions/20260311_0007_durable_agent_runtime.py`
- `api/migrations/versions/20260311_0008_run_callback_tickets.py`
- `api/migrations/versions/20260312_0010_workflow_published_endpoints.py`
- `api/migrations/versions/20260312_0011_publish_endpoint_lifecycle.py`
- `api/migrations/versions/20260312_0012_published_endpoint_api_keys.py`
- `api/migrations/versions/20260312_0013_published_endpoint_alias_path.py`
- `api/migrations/versions/20260312_0014_published_endpoint_invocations.py`
- `api/migrations/versions/20260312_0015_run_callback_ticket_expiry.py`
- `api/migrations/versions/20260312_0016_publish_endpoint_rate_limits.py`
- `api/migrations/versions/20260312_0017_publish_endpoint_cache.py`
- `api/migrations/versions/20260312_0018_publish_invocation_cache_status.py`

当前迁移会创建以下表：

- `workflows`
- `runs`
- `node_runs`
- `run_events`
- `run_artifacts`
- `tool_call_records`
- `ai_call_records`
- `run_callback_tickets`
- `workflow_published_endpoints`
- `workflow_published_api_keys`
- `workflow_published_invocations`
- `workflow_published_cache_entries`

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
- 当前节点指针
- checkpoint payload

#### `node_runs`

记录每个节点的一次执行：

- 节点 ID / 名称 / 类型
- 输入输出
- 执行状态
- 错误信息
- 起止时间
- phase
- retry 计数
- phase 开始时间
- 节点 working context
- evidence context
- artifact refs
- waiting reason
- checkpoint payload

#### `run_events`

记录统一事件流，用于后续调试面板、回放和流式输出复用。

当前已记录的事件类型包括：

- `run.started`
- `run.resumed`
- `run.waiting`
- `node.started`
- `node.phase.changed`
- `node.skipped`
- `node.retrying`
- `node.output.completed`
- `node.context.read`
- `node.join.ready`
- `node.join.unmet`
- `tool.completed`
- `run.callback.ticket.issued`
- `run.callback.ticket.expired`
- `run.callback.received`
- `assistant.completed`
- `node.failed`
- `run.completed`
- `run.failed`

#### `run_artifacts`

记录运行期原始大结果与衍生摘要引用：

- 工具原始输出
- AI 输入/输出快照
- 大 JSON / 长文本 / 文件引用
- artifact URI、摘要、content type、scope

#### `tool_call_records`

统一记录工具调用：

- tool 名称 / 来源
- 参数摘要
- 标准化结果摘要
- latency / error
- raw artifact ref

#### `ai_call_records`

统一记录主 AI 与 assistant：

- role（`main` / `assistant`）
- phase
- 输入摘要 / 输出摘要
- latency / token / cost（可获取时）
- prompt / response artifact ref

#### `run_callback_tickets`

统一记录 `waiting_callback` 的正式回调票据：

- callback ticket
- `run_id / node_run_id / tool_call_id / tool_id`
- waiting 状态与对应的 tool index
- ticket 生命周期状态（`pending / consumed / canceled`）
- ticket TTL 与到期时间（`expires_at / expired_at`）
- callback payload 与消费时间

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
- 创建/更新 workflow 时会同步生成 `workflow_compiled_blueprints`
- 创建/更新 workflow 时会同步生成 `workflow_published_endpoints`
- `runs` 当前会继续记录执行绑定的 `compiled_blueprint_id`

当前相关文件：

- `api/app/schemas/workflow.py`
- `api/app/services/workflow_definitions.py`
- `api/app/services/compiled_blueprints.py`
- `api/app/services/workflow_publish.py`
- `api/app/api/routes/workflows.py`
- `api/app/api/routes/workflow_publish.py`
- `api/migrations/versions/20260309_0002_workflow_versioning.py`
- `api/migrations/versions/20260311_0009_compiled_workflow_blueprints.py`
- `api/migrations/versions/20260312_0010_workflow_published_endpoints.py`

当前最小版本管理策略：

- 工作流初始版本为 `0.1.0`
- 仅当 `definition` 发生变更时自动递增 patch 版本，例如 `0.1.0 -> 0.1.1`
- 纯名称修改不会创建新版本
- `workflow_versions` 用于保存不可变快照，供后续运行追溯、发布绑定和缓存失效复用
- `workflow_compiled_blueprints` 用于保存编译后的稳定执行蓝图，供 runtime run binding、后续 publish binding 和回放复用
- `workflow_published_endpoints` 用于保存按 version snapshot 声明的 publish bindings，并显式绑定目标 `workflow_version + compiled_blueprint`
- `workflow_published_endpoints` 当前已补上最小 lifecycle 字段：
  - `lifecycle_status`
  - `published_at`
  - `unpublished_at`
- `workflow_published_endpoints` 当前已补上最小地址字段：
  - `endpoint_alias`
  - `route_path`
- `workflow_published_endpoints` 当前已补上最小发布治理字段：
  - `rate_limit_policy`
  - `cache_policy`
- `workflow_published_api_keys` 用于保存 published endpoint 的独立 API key 实体，并按 `workflow_id + endpoint_id` 作用域复用到不同版本 binding
- `workflow_published_invocations` 用于保存 published endpoint 的调用活动事实：
  - 入口来源（workflow / alias / path）
  - 调用状态（succeeded / failed / rejected）
  - cache 状态（`hit / miss / bypass`）
  - 最近关联的 `run_id / run_status`
  - request / response 的摘要预览与 duration
- `workflow_published_cache_entries` 用于保存 published endpoint 的响应缓存事实：
  - `binding_id + cache_key` 唯一键
  - 完整 published response payload
  - `hit_count / last_hit_at`
  - `expires_at`

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

截至 2026-03-11，这一层已经从“最小执行器”升级到 Durable Agent Runtime Phase 1：

- 引入最小 `Flow Compiler`
  - `api/app/services/flow_compiler.py`
  - 负责把设计态 workflow/version 快照编译成运行时 blueprint，补齐拓扑顺序、输入输出关系和默认结构
- 引入 `CompiledBlueprintService`
  - `api/app/services/compiled_blueprints.py`
  - 负责把 `workflow_version -> compiled blueprint` 变成持久化事实，并让 `runs` 显式绑定 `compiled_blueprint_id`
- `RuntimeService` 升级为可恢复的 phase state machine 风格执行器
  - `api/app/services/runtime.py`
  - `api/app/services/runtime_graph_support.py`
  - 支持 checkpoint、resume、waiting 状态、节点 phase 推进与持久化
- 引入 `ContextService`
  - `api/app/services/context_service.py`
  - 把上下文拆为 global / working / evidence / artifact 引用四层
- 引入 `RuntimeArtifactStore`
  - `api/app/services/artifact_store.py`
  - 原始大结果不再默认直接进入主 AI prompt，而是先落 artifact，再通过摘要和引用流转
- 引入统一 `Tool Gateway`
  - `api/app/services/tool_gateway.py`
  - 负责工具注册入口复用、参数透传、标准化结果、artifact 持久化与工具调用追踪
- 引入 `Agent Runtime`
  - `api/app/services/agent_runtime.py`
  - 让 `llm_agent` 从单次调用器演进为复合节点，内部 phases 为：
    - `prepare`
    - `main_plan`
    - `tool_execute`
    - `assistant_distill`
    - `main_finalize`
    - `emit_output`
- `assistant` 当前作为节点内可插拔 pipeline
  - 默认可关闭
  - 关闭时退化为旧式单主 AI 输出
  - 开启时只做 evidence 提炼，不负责流程推进
- 当前已开放第一版恢复接口
  - `POST /api/runs/{run_id}/resume`
  - 适用于 waiting tool / fallback 后的最小恢复闭环
- 当前已补上正式 callback ingress
  - `api/app/services/run_callback_tickets.py`
  - `POST /api/runs/callbacks/{ticket}`
  - `waiting_callback` 现在会签发 ticket，并可通过 callback 结果自动恢复 run
- callback ticket 当前已补上最小生命周期治理
  - `SEVENFLOWS_CALLBACK_TICKET_TTL_SECONDS` 用于控制 ticket TTL
  - `run_callback_tickets` 已保存 `expires_at / expired_at`
  - 过期 callback 会返回 `expired`，并写入 `run.callback.ticket.expired`
- callback ticket 当前已补上最小 cleanup 治理
  - 新增 `RunCallbackTicketCleanupService`
  - 新增 `POST /api/runs/callback-tickets/cleanup`
  - 新增 worker 任务 `runtime.cleanup_callback_tickets`
  - cleanup 过期事件会继续复用 `run.callback.ticket.expired`，并显式写入 `source + cleanup`
- callback ticket 当前已补上周期调度入口
  - `api/app/core/celery_app.py` 已注册 `runtime.cleanup_callback_tickets` 的 beat schedule
  - `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_SCHEDULE_ENABLED` / `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_INTERVAL_SECONDS` 用于控制自动清理开关与周期
  - Docker 全栈模式已新增独立 `scheduler` 进程承接 Celery beat
- 新增最小 `Run Resume Scheduler`
  - `api/app/services/run_resume_scheduler.py`
  - 把 runtime waiting 的恢复请求收口到独立调度层，默认投递给 Celery
- 新增 worker 任务 `runtime.resume_run`
  - `api/app/tasks/runtime.py`
  - worker 现在可以消费 waiting run 的恢复请求；若 run 已离开 waiting，会按当前状态幂等跳过
- 节点 retry backoff 已不再依赖同步 `sleep`
  - 有 backoff 的重试会把 run 挂起为 `waiting`
  - `node_runs.checkpoint_payload` 会记录 `retry_state` 与 `scheduled_resume`
- tool waiting 已可通过工具结果元数据声明恢复策略
  - 当前支持 `meta.waiting_status = waiting_tool / waiting_callback`
  - 当前支持 `meta.resume_after_seconds` 触发自动恢复调度
- callback 结果已开始复用既有运行态事实层
  - callback tool result 会回写 `tool_call_records` 与 `run_artifacts`
  - callback 生命周期会补到 `run_events`
  - 重复/过期 callback 当前会按 `accepted / already_consumed / expired / ignored` 做最小幂等处理

这让我们可以先验证：

- 工作流是否能跑通
- 运行态是否能完整落库
- 调试与观测数据是否可复用

### 6. 运行 API

当前新增接口：

- `POST /api/workflows/{workflow_id}/runs`
- `GET /api/workflows/{workflow_id}/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/execution-view`
- `GET /api/runs/{run_id}/evidence-view`
- `POST /api/runs/{run_id}/resume`
- `POST /api/runs/callbacks/{ticket}`
- `POST /api/runs/callback-tickets/cleanup`
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`
- `GET /api/runs/{run_id}/trace/export`
- `GET /api/workflow-library`
- `GET /api/workflows/{workflow_id}/published-endpoints`
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys`
- `POST /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys`
- `DELETE /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys/{key_id}`
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/cache-entries`
- `PATCH /api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run-async`
- `POST /v1/published-aliases/{endpoint_alias}/run`
- `POST /v1/published-aliases/{endpoint_alias}/run-async`
- `POST /v1/published-paths/{route_path:path}`
- `POST /v1/published-paths-async/{route_path:path}`
- `POST /v1/chat/completions`
- `POST /v1/chat/completions-async`
- `POST /v1/responses`
- `POST /v1/responses-async`
- `POST /v1/messages`
- `POST /v1/messages-async`
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations`

用途：

- 触发一次最小工作流执行
- 为 workflow editor 提供 workflow 级 recent runs 摘要入口
- 查询执行详情
- 读取按节点聚合的 execution facts，供 run diagnostics 和后续 editor 复用
- 读取 evidence-focused 视图，供 assistant/evidence 排障与回放入口复用
- 恢复处于 waiting 状态的 run
- 消费 `waiting_callback` ticket 并自动恢复 run
- 批量清理已过期但仍处于 `pending` 的 callback tickets
- 查询事件流
- 为 AI / 自动化 提供带过滤条件的 run trace 检索
- 为创建页和 editor 提供共享的 workflow library snapshot，统一暴露 builtin/workspace starters、node catalog、tool lanes 和 tools
- 为发布态治理与后续开放 API 提供独立的 publish binding 查询入口
- 为 published endpoint 提供最小 API key 生命周期治理入口
- 为 publish cache 提供 binding 级 inventory 读取入口
- 为发布态治理提供最小 lifecycle 更新入口
- 沿 active publish binding 触发最小 native 发布调用
- 为 published endpoint 提供最小稳定外部地址入口（alias/path）
- 沿已发布 binding 触发最小 OpenAI / Anthropic 兼容调用入口
- 沿已发布 binding 触发最小 OpenAI / Anthropic async bridge 入口，并在 waiting 时返回带 `RunDetail` 的 protocol envelope
- 为 publish binding 提供最小活动查询入口，支撑开放 API 治理与审计
- `GET /api/workflow-library` 当前已开始按 `workspace_id` 过滤 adapter 绑定的 compat 工具，并把 `tool` 节点的 `binding_required` / `binding_source_lanes` 一并返回给 editor
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前默认返回 workflow 最新版本声明的 publish bindings，也支持按 `workflow_version` 或 `include_all_versions=true` 查看历史绑定
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前还支持按 `lifecycle_status` 过滤 `draft / published / offline`
- `GET/POST/DELETE /api/workflows/{workflow_id}/published-endpoints/{binding_id}/api-keys` 当前会把 API key 管理绑定到 endpoint 级别事实，而不是单个 version binding
- published API key 当前只保存 `key_prefix + key_hash`，明文 key 仅在创建时返回一次
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/cache-entries` 当前会返回 binding 级 cache inventory summary + active items
- `PATCH /api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle` 当前支持把 binding 切到 `published / offline`
- 同一 `workflow_id + endpoint_id` 下，新的 `published` binding 会自动把旧的已发布 binding 收口为 `offline`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run` 当前只会命中 `published` binding，并固定执行 binding 指向的 `target_workflow_version + compiled_blueprint`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run-async` 当前沿同一条 binding 执行链工作；若 run 进入 `waiting`，会返回 `202 + RunDetail`，而不是把 durable waiting workflow 直接拒绝成 `409`
- `POST /v1/published-aliases/{endpoint_alias}/run` 当前会按 active publish binding 的 `endpoint_alias` 命中 native endpoint
- `POST /v1/published-aliases/{endpoint_alias}/run-async` 当前会复用同一 alias binding 承接 durable waiting run
- `POST /v1/published-paths/{route_path:path}` 当前会按 active publish binding 的 `route_path` 命中 native endpoint
- `POST /v1/published-paths-async/{route_path:path}` 当前作为 path 入口的 async 变体，避免 `{route_path:path}` 与 `/run-async` 后缀在路由层互相吞噬
- `POST /v1/chat/completions` 与 `POST /v1/responses` 当前会通过 `model -> published endpoint alias` 命中 `protocol=openai` 的 active binding
- `POST /v1/chat/completions-async` 与 `POST /v1/responses-async` 当前会沿同一条 alias binding 执行链工作：
  - `run.status=succeeded` 时返回 `200 + PublishedProtocolAsyncRunResponse`
  - `run.status=waiting` 时返回 `202 + PublishedProtocolAsyncRunResponse`
  - 当前仍是 async bridge，不是假装已支持标准 OpenAI SSE
- `POST /v1/messages` 当前会通过 `model -> published endpoint alias` 命中 `protocol=anthropic` 的 active binding
- `POST /v1/messages-async` 当前会沿同一条 alias binding 承接 Anthropic waiting run，并返回同样的 protocol async envelope
- 当前开放 API 仍保持 MVP 诚实边界：
  - `native/openai/anthropic` 入口都只支持 `auth_mode=internal/api_key`
  - 当前都只支持 `streaming=false`
  - OpenAI / Anthropic 当前只实现最小非流式返回体，不假装已经覆盖完整协议字段
  - sync published endpoint 当前只接受 `run.status=succeeded` 的结果；若 workflow 进入 `waiting`，会明确返回 `409`
  - native async published endpoint 现在可以诚实接住 `run.status=waiting`，并返回 `202 + RunDetail`
  - protocol async bridge 现在也能诚实接住 `run.status=waiting`，并返回 `202 + PublishedProtocolAsyncRunResponse`；但这仍然不是 OpenAI / Anthropic 的 streaming/SSE
- `auth_mode=api_key` 当前已支持 `x-api-key`，并兼容 `Authorization: Bearer <key>` 的最小 header 形态
- publish definition 当前已支持 `alias/path`，缺省会回退到 `endpoint_id` 与 `/{endpoint_id}`
- publish definition 当前已支持声明 `rateLimit.requests + rateLimit.windowSeconds`
- publish definition 当前已支持声明 `cache.ttl / cache.maxEntries / cache.varyBy`
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前会直接返回 `rate_limit_policy + cache_policy`，供治理页复用 binding 级发布托管配置
- 发布 binding 切到 `published` 时，当前会阻止跨 workflow 的 alias/path 冲突，避免外部地址语义撞车
- `PublishedEndpointGatewayService` 当前已开始把 native invoke 写入独立 `workflow_published_invocations`
- `PublishedEndpointGatewayService` 当前已开始在执行 workflow 前基于 `workflow_published_invocations` 强制执行 binding 级 rate limit
- `PublishedEndpointGatewayService` 当前已开始通过独立 `PublishedEndpointCacheService` 处理 binding 级 response cache：
  - 缓存键默认绑定 `binding_id + stable input payload`
  - 若声明 `cache.varyBy`，则只按指定字段路径参与缓存键计算
  - OpenAI / Anthropic 会继续在 cache identity 中补上 protocol surface，避免 `/chat/completions` 与 `/responses` 串用同一份缓存
  - 缓存命中时直接复用已缓存的 published response payload，不重复执行 workflow
- async published endpoint 当前只会缓存 `run.status=succeeded` 的响应：
  - native async 会缓存成功的原生响应
  - protocol async bridge 会缓存成功的 async envelope
  - `run.status=waiting` 的 async 响应不会进入 publish cache，避免同参请求复用旧的 `run_id + waiting` 中间态
  - 这类 async waiting 请求当前会显式返回 `X-7Flows-Cache: BYPASS`
- published async 入口当前都会返回 `X-7Flows-Cache`，并补充 `X-7Flows-Run-Status`
- published invocation audit 当前已区分 `cache_status=hit/miss/bypass`
- 协议层 `stream=true` 的 `chat.completions / responses / messages` 请求即使当前仍返回 `422`，现在也会尽量复用 binding 级 `workflow_published_invocations` 记录 `request_surface + reason_code=streaming_unsupported + api_key usage`，不再在 route 层静默丢失治理信号
- invocation audit 当前已补上 async protocol surface：
  - `openai.chat.completions.async`
  - `openai.responses.async`
  - `anthropic.messages.async`
- invocation audit 当前只要 response payload 中存在 `run`，就会继续回填 `run_id / run_status / error_message`，不再只偏向 native route
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前返回的 `activity` 摘要已带 cache hit/miss/bypass 统计
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前还会返回 binding 级 `cache_inventory` 摘要，供 workflow 页治理区直接消费
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations` 当前 summary/facets/items 已可区分缓存命中与真实执行
- 当前 rate limit 只统计 `succeeded / failed` 调用；`rejected` 仍会进入审计，但不会占用执行配额
- 发布活动当前会记录：
  - `request_source`
  - `status`
  - `api_key_id`
  - `run_id / run_status`
  - request / response preview
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前会额外返回 `activity` 摘要，便于治理页直接显示最近调用情况
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations` 当前支持读取 binding 级 activity summary + recent items
- `GET /api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations` 当前还支持按 `status / request_source / request_surface / cache_status / run_status / api_key_id / reason_code / created_from / created_to` 筛选，并返回失败原因聚合、原因码聚合、request surface facets、cache facets、run status facets、API key 维度使用统计和 timeline buckets
- published invocation audit 当前已补上 `summary.last_reason_code`、`facets.reason_counts`、`facets.request_surface_counts`、`items[].reason_code` 与 `items[].request_surface`，可直接区分 `rate_limit / api_key / sync waiting / auth mode / protocol surface` 等治理信号，而不是只看原始 `error_message`
- native publish governance 当前还会把 `native.workflow.async / native.alias.async / native.path.async` 作为独立 request surface 暴露
  - 这样 publish activity / timeline / request surface filter 不会再把 native sync 与 async 调用混为一谈
- timeline buckets 当前已继续补上 `request_surface_counts + reason_counts`，让治理页可以在时间维度回答“哪种协议面在放量、哪个失败原因在持续抬头”，而不是只看总调用量曲线
- published invocation audit 当前已继续补上 `facets.api_key_usage[].succeeded/failed/rejected_count` 与 `timeline[].api_key_counts`，让治理页可以直接回答“哪把 key 正在放量、哪把 key 最近开始出现拒绝/失败”，而不是只看全局调用总量
- published invocation audit 当前还会在 `timeline[].cache_status_counts` 中固定返回 `hit / miss / bypass` 三态，让 cache 观察和时间桶对比不再依赖前端自行补零
- published invocation audit 当前已继续补上 `facets.run_status_counts` 与 `timeline[].run_status_counts`，让 workflow 页可以直接区分“publish 请求已被成功接住，但 workflow 仍处于 waiting”与真正 terminal run 的差异
- `GET /api/workflows/{workflow_id}/runs` 当前会聚合返回 run 状态、版本、`node_run_count`、`event_count` 和 `last_event_at`，供 editor 选择最近执行上下文，而不是继续依赖首页摘要拼装
- `GET /api/runs/{run_id}` 当前已支持 `include_events=false` 的摘要模式，供 run 诊断页等人类界面减少与 `/trace` 的重复数据搬运
- `GET /api/runs/{run_id}/execution-view` 当前会把 `run_artifacts / tool_call_records / ai_call_records / run_callback_tickets` 聚合成节点级 execution facts
- `GET /api/runs/{run_id}/evidence-view` 当前会围绕 `node_runs.evidence_context`、assistant 调用、supporting artifacts 和 decision output 输出 evidence-focused 视图
- `POST /api/runs/{run_id}/resume` 当前会从 `runs.checkpoint_payload` 与 `node_runs.checkpoint_payload` 恢复 phase state machine；事件里会额外带出 `source`
- `POST /api/runs/callbacks/{ticket}` 当前会把 callback 结果写回 waiting tool 的 checkpoint / tool trace / artifact，再自动调用 `resume_run`
- `POST /api/runs/callback-tickets/cleanup` 当前支持 `source / limit / dry_run`，并返回匹配数、实际过期数和受影响 ticket 明细
- runtime 当前还能通过 worker 侧 `runtime.resume_run` 消费被调度的 waiting run，并把计划恢复写成 `run.resume.scheduled`
- worker 当前还能通过 `runtime.cleanup_callback_tickets` 复用同一治理服务，对 stale `pending` tickets 做批量过期
- `scheduler` 当前会按固定周期投递 `runtime.cleanup_callback_tickets`，把 callback ticket cleanup 从手动治理推进到自动治理
- 当前 trace 过滤已支持 `event_type`、`node_run_id`、时间范围、`payload_key`、事件游标和顺序控制
- 当前 trace 还补充了回放 / 导出元信息，例如 trace / returned 时间边界、事件顺序、`replay_offset_ms` 以及 opaque `cursor`
- `GET /api/runs/{run_id}/trace/export` 当前支持 `json` 与 `jsonl`，导出会复用相同过滤条件，便于离线分析与后续 replay 包演进

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
- `GET /api/runs/{run_id}/execution-view`
- `GET /api/runs/{run_id}/evidence-view`

边界：

- 默认展示摘要、统计、预览和跳转入口
- 允许为了可读性做聚合、排序、裁剪和视觉组织
- 不能把 UI 面板本身当成 AI 排障或审计的唯一事实来源
- `execution-view / evidence-view` 属于“面向人类与 UI 复用的聚合事实层”，仍然建立在同一批运行态对象上，而不是新的私有日志体系

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
- `docs/product-design.md` 中新增的“5.4 项目架构图（文字化）”与“6.5 关键时序图（文字化）”，作为目标设计总览入口
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
- `GET /api/workflows/{workflow_id}/published-endpoints`

### 8. 前端最小 workflow 编辑器骨架

当前前端已经不再只是系统诊断与 run 诊断工作台，也补上了最小可用的 workflow 编辑器入口：

- 新增独立新建路由：
  - `GET /workflows/new`（Next.js 页面路由）
- 新增独立编辑路由：
  - `GET /workflows/{workflow_id}`（Next.js 页面路由）
- 引入 `xyflow` 作为画布基础：
  - 当前已提供 starter template 新建向导，创建成功后会直接进入 editor
  - 当前已新增统一 `workflow node catalog`，把 starter template、节点默认名称/位置和 editor palette 收敛到同一份节点能力描述
  - 当前已新增 `workflow business tracks` 与 `starter library` 元数据：
    - 创建页会按 `应用新建编排` / `编排节点能力` / `Dify 插件兼容` / `API 调用开放` 四条主业务线筛选 starter
    - starter template 会显式标注优先级、主线焦点、来源生态和推荐下一步
    - 当前已补充 `Response Draft`，让“API 调用开放”不再完全停留在文档层
- 当前已新增共享 `workflow source model`，把 starter template / node catalog / tool registry 的来源信息收成同一套描述：
    - starter library 会显式区分 `builtin / workspace / ecosystem(planned)` 三类模板来源 lane
    - node palette 会显式标注 `native node catalog` 来源
    - editor palette 会汇总 tool registry 的 `native / compat:*` 工具来源 lane
    - 当前这些来源语义已经从前端本地常量推进到后端共享 snapshot `GET /api/workflow-library`
    - 当前 shared snapshot 也已开始尊重 workspace 级 adapter scope：
      - `tool_source_lanes` 会按 adapter `enabled / workspace_ids` 过滤 compat 工具来源
      - `tool` 节点会显式返回 `binding_required` 和 `binding_source_lanes`，把 node/tool source contract 从文案推进成真实字段
  - 当前已新增 workspace starter 的真实数据源与最小治理入口：
    - 后端新增 `workspace_starter_templates` 持久化表和 `/api/workspace-starters` 读写接口
    - 创建页当前会优先读取 `/api/workflow-library`，由后端统一带回 builtin/workspace starters 与来源 lane
    - `/api/workspace-starters` 已支持按 `business_track` / `search` 做列表筛选，并支持读取单个模板详情
    - editor 目前已支持把当前 workflow 保存为 workspace starter，回到创建页即可复用
    - 当前已新增独立治理页 `GET /workspace-starters`：
      - 支持模板列表、业务主线筛选、关键字筛选、详情查看和 metadata 更新
      - 支持从治理页跳回源 workflow，形成 editor -> starter library -> editor 的往返链路
    - 当前已补齐 workspace starter 第二阶段治理：
      - `/api/workspace-starters` 已支持 `include_archived` / `archived_only`
      - 已新增 archive / restore / delete 接口，且删除默认要求先归档
      - 治理页已支持 active / archived / all 状态筛选
      - 治理页已支持归档、恢复、删除操作
      - 治理页会复用 `/api/workflows/{workflow_id}` 展示来源 workflow 漂移摘要
      - 创建页已支持通过 `starter` 查询参数回填选中的 workspace starter
    - 当前已开始进入 workspace starter 第三阶段治理：
      - 后端已新增 `workspace_starter_history`，把 create / update / archive / restore / refresh 变成可追溯治理事实
      - `/api/workspace-starters/{template_id}/history` 已支持读取模板治理历史
      - `/api/workspace-starters/{template_id}/refresh` 已支持从源 workflow 刷新模板 definition 快照
      - `/api/workspace-starters/{template_id}/source-diff` 已支持返回机器可读的 source drift diff
      - `/api/workspace-starters/{template_id}/rebase` 已支持把 source-derived 字段同步回 starter（definition / source version / default workflow name）
      - 治理页已支持执行来源刷新、查看独立历史面板、查看 source diff，并在需要时执行 rebase
      - 当前已继续补上结果集批量治理：
        - `/api/workspace-starters/bulk` 已支持按当前筛选结果批量 archive / restore / refresh / rebase / delete
        - 批量治理会继续复用 `workspace_starter_history`，并通过 `payload.bulk=true` 标识批量上下文
        - 批量删除继续遵循“先归档再删除”，并会同步清理 starter history，避免删除模板时残留孤儿治理记录
        - 批量结果会额外返回 `deleted_items` 和 `skipped_reason_summary`，用于前端展示风险提示和跳过原因聚合
      - 当前 source diff 已细化到字段级：
        - changed node / edge 会返回 `changed_fields`
        - 治理页会基于 definition drift / workflow name drift 提示 refresh 与 rebase 的决策差异
      - 当前治理页已把 bulk governance 区块拆到独立子组件，避免 `workspace-starter-library.tsx` 一边补能力一边重新长回单文件混排
  - 当前创建页已把 starter 浏览逻辑拆到独立组件，避免 `/workflows/new` 再次长成页面级杂糅入口
  - 当前已支持把 workflow definition 映射为画布节点与连线
  - 当前已支持新增 `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output`
  - 当前已支持编辑节点名称、基础 `config`、基础 `runtimePolicy`
  - 当前已支持编辑 edge 的 `channel` / `condition` / `conditionExpression`
  - 当前已支持保存回 `PUT /api/workflows/{workflow_id}`，继续复用版本快照递增
- 当前 workflow 页面会优先读取 `/api/workflow-library`，把 node catalog、tool lanes 和 tool catalog 一并带入 editor
- 当前 workflow 页面会并行读取 `/api/workflows/{workflow_id}/runs`，把 recent runs 直接带入 editor runtime overlay
- 当前 workflow 页面还会并行读取 `/api/workflows/{workflow_id}/published-endpoints`，在 editor 下方挂独立 publish governance panel
- 对启用 cache 的 binding，workflow 页面会进一步读取 `/cache-entries`，展示 active cache inventory 摘要与条目预览
- 对 `auth_mode=api_key` 的 binding，workflow 页面会进一步读取 active API key 列表，并提供 create / revoke / one-time secret 展示
- workflow 页面当前还会继续读取 `/invocations`，把最近调用审计、API key 使用、最近失败原因与 request source / request surface / cache facet 接回 publish panel
- 对启用 `rate_limit_policy` 的 binding，workflow 页面会按当前限流窗口再次读取 `/invocations`，直接展示 window used / remaining / rejected 的治理信号
- workflow 页面当前已把 cache inventory、API key、invocation audit 与 rate-limit window 的并行装配收口到 `web/lib/get-workflow-publish-governance.ts`，让页面继续保持“数据装配 + 区块拼接”的薄层职责
- publish governance panel 当前已按职责拆成 `panel -> binding card -> invocation activity` 子组件，避免 workflow 页继续长回单文件混排
- `invocation activity` 当前会直接展示 traffic mix、request surface、run status、rate-limit window、API key usage、失败原因和 timeline buckets，开放 API 的治理反馈不再只停留在基础统计摘要
- timeline 区块当前已进一步拆成独立 `workflow-publish-traffic-timeline.tsx`，把时间趋势渲染从 `workflow-publish-activity-panel.tsx` 中旁路出去，避免活动面板继续堆胖
- publish governance timeline 当前会继续展示每个时间桶的 top API key，使“哪把 key 在某个时间窗放量/触发问题”可以直接在 workflow 页观察，不必回到原始 invocation 列表手工比对
- workflow 页面当前已把 `cache_status / run_status` 接成 binding 级治理过滤项，并在 active chips、recent items 与 timeline bucket 中统一展示 cache / run state label
- workflow 页面当前已支持按 binding 级 query 参数驱动 invocation audit 筛选：
  - 支持 `status / request_source / request_surface / cache_status / run_status / reason_code / api_key_id / time window`
  - 当前筛选仍保持 server-driven，继续复用后端 `/invocations` 事实层，而不是在前端再复制一套治理状态
  - 当前默认只对被选中的 binding 应用筛选，其余 binding 继续维持最近调用摘要，避免 workflow 页面一次性拉高所有 binding 的查询体量
- 当前 `llm_agent` / `tool` / `mcp_query` / `condition` / `router` / `output` 节点已开始进入结构化配置表单，并保留高级 JSON 兜底：
    - `llm_agent`
      - 可编辑 `provider` / `modelId` / `temperature`
      - 可编辑 `systemPrompt` / `prompt`
      - 可显式切换 `toolsEnabled` / `mcpEnabled` / `sandboxEnabled`
      - 可声明可读上游上下文授权
    - `tool`
      - 可直接绑定持久化 compat / native 工具目录项
      - 可编辑 `adapterId` / `timeoutMs`
      - 可基于 `input_schema` 渲染简单输入字段（`string` / `number` / `boolean` / `enum`）
    - `mcp_query`
      - 可编辑 `authorized_context` 的 readable nodes、extra artifact grants、query sources、query artifact types
    - `condition` / `router`
      - 可在 selector rules / expression / fixed branch 三种模式间切换
    - `output`
      - 可编辑 `format` / `responseKey` / `contentType`
      - 可补充 response notes 和 `includeRunMetadata`
  - 当前 inspector 已从画布壳层中拆出独立组件，降低 editor 主组件耦合
  - 当前 editor 已支持把选中 run 的 `node_runs` / `trace` 摘要接回画布：
    - 画布节点会叠加执行状态、最近事件、耗时和错误摘要
    - 左侧新增 runtime overlay panel，可选择 recent run、查看 node timeline、trace preview，并跳转到 run diagnostics / trace export
    - 当前 overlay 仍复用现有 `/api/runs/{run_id}` 与 `/trace`，没有另起前端专用 runtime 协议
  - 当前 editor 两个核心大组件已按职责拆出子模块：
    - `workflow-node-config-form.tsx` 当前只保留节点类型分发；各节点结构化表单、授权区块和 schema 工具已拆到子目录
    - `workflow-editor-workbench.tsx` 当前主要保留状态编排；hero / sidebar / canvas / run overlay helper / canvas node 已拆到子目录

当前相关文件：

- `api/app/api/routes/workflow_library.py`
- `api/app/schemas/workflow_library.py`
- `api/app/services/workflow_library.py`
- `web/app/workflows/new/page.tsx`
- `web/app/workflows/[workflowId]/page.tsx`
- `web/app/workspace-starters/page.tsx`
- `web/lib/get-workflow-library.ts`
- `web/components/workflow-create-wizard.tsx`
- `web/components/workflow-starter-browser.tsx`
- `web/components/workflow-editor-workbench.tsx`
- `web/components/workflow-editor-workbench/*`
- `web/components/workflow-editor-inspector.tsx`
- `web/components/workflow-run-overlay-panel.tsx`
- `web/components/workspace-starter-library.tsx`
- `web/components/workspace-starter-library/*`
- `web/components/workflow-node-config-form.tsx`
- `web/components/workflow-node-config-form/*`
- `web/lib/get-workflow-runs.ts`
- `web/lib/get-workspace-starters.ts`
- `web/lib/workspace-starter-payload.ts`
- `web/lib/workflow-business-tracks.ts`
- `web/lib/workflow-node-catalog.ts`
- `web/lib/workflow-editor.ts`
- `web/lib/workflow-source-model.ts`
- `web/lib/workflow-starters.ts`

当前边界：

- 仍然是“最小骨架”，不是完整节点配置系统
- workspace starter 已补齐归档 / 删除、来源漂移摘要、来源 refresh、治理历史、source diff、字段级 changed fields、rebase、批量 archive / restore / refresh / rebase / delete、跳过原因聚合和创建页深链回填，但批量结果钻取与更细的团队决策提示仍未补齐
- ecosystem 模板仍然只是规划态，还没有真实数据源
- 统一 node catalog / starter / tool lanes 已进入共享后端 contract，`tool` 节点也开始显式携带 workspace-scoped `binding_source_lanes`；但未来节点插件注册中心、更完整的 adapter health/scope contract 和 ecosystem starter 仍未打通
- `runtimePolicy` / edge `mapping[]` / 更细的节点输入输出 schema 仍未结构化
- `tool` 的复杂对象 / 数组 schema 字段仍需要通过高级 JSON 编辑
- 已经支持 recent run 的静态附着与节点高亮，但还没有做到 editor 内逐事件回放、过滤翻页和实时流式联动
- 前端测试基线仍未建立

### 当前架构与体量判断

- 上一条正式 Git 提交是 `feat: add published protocol async bridge`：
  - `native / openai / anthropic` 的 async published route 已可在 `run.status=waiting` 时返回 `202 + run detail`
  - publish invocation 已能稳定记录 async protocol surface 与 `run_status`
- 本轮继续承接这条主线，把 async bridge 从“能返回”推进到“能治理”：
  - `/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations` 当前已支持 `run_status` 查询参数
  - summary/facets/timeline 当前已补上 `run_status` 维度
  - workflow 页面当前已把 `run_status` 接到 binding 级服务器端过滤表单、active chips、traffic mix 和 timeline 展示
  - 这让 publish governance 可以直接回答“哪些请求已经成功受理，但 workflow 仍在 waiting”
- 这次承接判断仍然是：需要衔接，而且主线仍然是 `API 调用开放` 的 P0 发布治理，而不是再回到 callback cleanup 深挖
- 当前前端承接仍保持解耦方向：
  - `web/app/actions.ts` 已拆成 `workflow` / `publish` 两组 server actions
  - plugin registry / tool binding 与 publish lifecycle / API key 现在按业务模块分别消费自己的 action 文件
  - publish governance 的 active filter 类型已收口到 `web/lib/workflow-publish-governance.ts`，避免 page / panel / binding card / activity panel 继续复制同一组筛选边界
- 当前真正需要持续承接的实现主线仍是 `feat: add durable agent runtime phase1`：
  - Phase 1 已经把 `compiler / runtime / agent runtime / tool gateway / context / artifact` 这套后端基础拆出来
  - 前几轮沿这条线补上了 `run_callback_tickets + callback ingress`
  - 最近两轮继续把 callback ticket 收口为带 TTL/过期态、cleanup 和周期调度的生命周期对象，并让 execution view 与统一事件流直接复用这批事实
  - 最近几轮把 publish binding、publish lifecycle、alias/path、activity audit、最小 native publish invoke、OpenAI / Anthropic 最小兼容入口、binding 级 rate limit 与 reason-coded governance signals 接到 compiled blueprint 主线上，为开放 API 做最小承接
- 当前基础框架已经写到“可以继续推进主业务”的阶段：
  - `应用新建编排` 这一条线已经有 `workflow library -> starter -> editor -> 保存版本 -> recent runs overlay`
  - `编排节点能力` 这一条线已经有 phase runtime、tool/evidence/artifact、scheduler resume 和 callback ingress
  - `Dify 插件兼容` 已有 registry / adapter / tool lane / workspace scope 的基础 contract，但生命周期仍未完整
- `API 调用开放` 已从纯设计占位推进到 `publish binding + lifecycle + alias/path + native invoke + native/protocol async bridge + OpenAI / Anthropic 非流式入口 + api_key auth + activity audit + request surface + cache status + run status + time window/timeline + per-bucket surface/reason/cache/run/API-key breakdown + binding rate limit + cache inventory + workflow 页面治理入口 + binding 级 invocation filters` 最小闭环；但 streaming、协议字段完整度和长期趋势治理还没真正接上
- `API 调用开放` 这轮额外补上了“未实现 streaming 请求也要留下治理事实”的边界：协议路由不再把 `stream=true` 的拒绝静默丢在 route 层，而是会尽量写入 binding 级 invocation audit；但真正的 SSE / unified event-stream mapping 仍未实现
- 当前架构方向整体是解耦的，但仍有未完全拆开的高风险边界：
  - 后端已经开始形成 `Flow Compiler -> RuntimeService -> AgentRuntime / ToolGateway / ContextService / RunResumeScheduler / RunCallbackTicketService / WorkflowPublishBindingService` 的分层
  - execution / evidence 查询也已独立落到 `RunViewService + run_views route`，没有继续把聚合逻辑塞回 `runs.py`
  - publish binding 也已独立落到 `WorkflowPublishBindingService + workflow_publish route`，没有继续把发布态查询揉进 workflow detail 大包
  - publish invoke 现在也已独立落到 `PublishedEndpointGatewayService + published_gateway route`，没有把发布协议入口继续塞回 `runs.py` 或 `workflow_publish.py`
  - published API key 生命周期也已独立落到 `PublishedEndpointApiKeyService + published_endpoint_keys route`，没有塞回 runtime 或 workflow CRUD
  - published activity 现在也已独立落到 `PublishedInvocationService + published_endpoint_activity route`，没有把调用审计继续塞回 gateway route 或 runtime 主循环
  - publish rate limit 当前继续复用 `PublishedInvocationService` 做窗口计数，而没有把计数逻辑塞回 route 或 runtime 主循环
  - callback ticket cleanup 现在也已独立落到 `RunCallbackTicketCleanupService + run_callback_tickets route`，没有继续把批量治理塞回 `runtime.py` 或 `runs.py`
  - worker 恢复入口已经从运行主循环里旁路出来，没有继续把后台调度写死在 API 或 `RuntimeService` 单点内
  - `ExecutionArtifacts / CallbackHandleResult` 这类 runtime 返回模型已从 `runtime.py` 抽到 `runtime_records.py`，避免主执行器继续堆叠非执行职责
  - 前端创建页、editor、starter 治理也已开始围绕共享 snapshot 演进，而不是各自维护私有常量
  - workflow 页当前通过 `getWorkflowPublishGovernanceSnapshot` 统一装配 publish 治理数据，没有继续把并行 fetch、筛选和空态兜底堆回 page component
  - `run diagnostics` 新增 execution/evidence sections，但通过独立组件承接，没有继续把 `run-diagnostics-panel.tsx` 变成新的页面级大文件
  - callback ticket cleanup 现在也已接入独立 scheduler 进程，避免再把周期治理塞回 API 或 `RuntimeService`
  - 但 publish endpoint 的更完整 protocol mapping / streaming、callback ticket 更强鉴权/系统诊断可见性，以及节点插件注册中心仍未彻底拆清
- 当前需要显式盯住的长文件：
  - `api/app/services/runtime.py` 当前约 1502 行，已经重新越过后端 1500 行偏好阈值；下一轮若继续补 scheduler、callback 治理或 publish gateway，应优先拆 execution / waiting / resume orchestration
  - `api/app/api/routes/runs.py` 仍然偏长，但本轮已把 execution / evidence 聚合和 RunDetail 序列化拆出；下一轮若继续扩展 trace/export/callback，应进一步考虑 trace/export/callback 子模块拆分
  - `api/app/services/agent_runtime.py` 当前约 628 行，已经承载 phase pipeline、tool waiting 恢复和 evidence 组装；若继续长出 assistant 策略与 subflow 候选能力，应提前拆 plan/tool/finalize 子阶段
  - `api/app/services/workflow_library.py` 当前约 650 行，仍适合继续演进，但若再接 adapter health / node plugin registry，应优先拆 source assembly 与 starter builder
- `api/app/services/published_invocations.py` 当前约 1047 行，已经承载 activity summary、request/cache/run status 过滤、timeline、API key 维度统计和 rate limit 计数；若继续长出长期趋势、async lifecycle drilldown 或更多协议治理信号，应提前拆 query/filtering 与 audit aggregation
  - `api/tests/test_runtime_service.py` 当前约 1595 行，测试体量已经过载；下一轮若继续补 waiting/resume/error path，应优先按执行路径拆分测试文件
  - `api/tests/test_workflow_publish_routes.py` 当前约 1045 行；这轮没有继续往里堆 protocol async 测试，而是新增 `api/tests/test_published_protocol_async_routes.py`（约 181 行）承接 async bridge 验证；后续若继续补 streaming / more protocol audit，应继续沿 native/openai/anthropic 与 governance/query 边界拆分
- `api/tests/test_workflow_publish_activity.py` 当前约 595 行，专门承接 publish activity / audit / timeline 治理验证；后续若继续长出更多时间序列与 API key drilldown，可考虑再拆 `timeline` 与 `filtering` 两组测试
  - `web/app/actions.ts` 当前已收口为极薄兼容 barrel；真正的 server actions 已拆到 `web/app/actions/workflow.ts` 与 `web/app/actions/publish.ts`
  - `web/components/workspace-starter-library.tsx` 当前约 1042 行，是前端体量最大的真实业务文件；虽然还在前端 2000 行偏好之内，但后续继续补批量结果钻取时仍应继续拆
  - `web/components/workflow-editor-workbench.tsx` 当前约 528 行，下一轮若继续把 execution / evidence view 接回 editor overlay，要避免重新长回页面级混排组件
  - `web/components/run-diagnostics-panel.tsx` 当前约 645 行，若继续塞 trace/export/filter 状态，应优先拆筛选器和时间线区块
- `web/components/workflow-publish-activity-panel.tsx` 当前约 510 行，这轮继续承接 cache status、native async surface 和 run status 可见性；后续若继续长出更多治理消费，应优先拆 filter form / summary / recent-items 区块，而不是再把趋势渲染塞回主面板
- `web/components/workflow-publish-traffic-timeline.tsx` 当前约 163 行，专门承接 per-bucket trend 渲染；后续若继续长出 API key / run status 趋势或 surface/reason 对比，再考虑拆成更细的 chart / bucket-card 子块
  - `web/components/workflow-publish-binding-card.tsx` 当前约 223 行，仍在健康范围内；若继续长出更多 publish 子治理区块，应优先把 cache / lifecycle / api-key 管理进一步拆开

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

当前 worker 除 `system.heartbeat` 外，也会消费 `runtime.resume_run` 与 `runtime.cleanup_callback_tickets`。

Scheduler:

```powershell
uv run celery -A app.core.celery_app.celery_app beat --loglevel INFO
```

当前 scheduler 会按 `SEVENFLOWS_CALLBACK_TICKET_CLEANUP_INTERVAL_SECONDS` 周期投递 callback ticket cleanup。

### Docker 全栈模式

```powershell
cd docker
Copy-Item .env.example .env
docker compose up -d --build
```

## 当前边界

这次实现故意没有往下做太深，避免把运行时和插件系统搅在一起。

但从当前阶段开始，基础能力不应再长期脱离主业务单独深化。后续优先级需要始终围绕以下四条主业务线展开，并由基础设施为它们提供支撑：

- 应用新建编排
- 编排节点能力
- Dify 插件兼容
- API 调用开放

当前还没有实现：

- 通用表达式引擎驱动的 DAG 条件语义
- Loop 节点执行
- 外部 MCP Provider 接入
- 完整插件兼容代理生命周期
- publish endpoint 的 cache 与更细的审计治理
- publish activity 的长期审计面板与更完整的趋势治理消费
- publish activity 按长期 API key 趋势、streaming 面、长期 reason/surface 变化的更细交互式筛选与钻取
- `native / openai / anthropic` 发布调用的 streaming / SSE 与更完整发布管理
- OpenAI / Anthropic 更完整的字段透传、usage 映射与协议面治理可见性
- native published endpoint 虽然已经补上 async invoke，但 OpenAI / Anthropic 仍没有真正的 streaming / SSE 或统一 async published invoke 承接链路
- scheduler 级 dead-letter / dedupe / metrics / 失败重投治理
- callback ticket 的更强鉴权与系统诊断治理可见性
- 回放调试面板
- 更完整的节点结构化配置抽屉
- editor 内消费 execution/evidence view、逐事件回放、trace 过滤和实时调试联动
- 节点目录与插件注册中心打通后的动态 starter / 节点库模型
- workspace starter 的批量结果钻取、字段级治理决策提示和更细的团队审阅反馈
- 前端 editor 测试基线

## 下一步建议

每轮开发结束后，这里的“下一步建议”都应同步刷新为按优先级排序的可执行计划。当前建议顺序如下。

当前判断：

- 本轮已经把 `compiled blueprint / version snapshot / run binding` 继续推进到 `publish binding + lifecycle + alias/path + native invoke + native/protocol async bridge + OpenAI/Anthropic 非流式兼容入口 + api_key auth + activity audit filters + request surface + cache status + run status + time window/timeline + per-bucket request_surface/reason/cache/run/API-key breakdown + binding rate limit + cache inventory + workflow 页面治理 + binding 级 invocation drilldown`。
- 发布态现在已经具备最小 native 调用、native/protocol async bridge、OpenAI / Anthropic 非流式入口、API key 鉴权、alias/path 地址闭环、基础审计视图、最小 binding 级限流，以及 workflow 页的 lifecycle / cache / API key / run status 治理入口；这轮已经把 async waiting run 的治理可见性补到筛选、summary 和 timeline，但距离完整开放 API 仍差 streaming、协议字段完整度和长期趋势治理。
- 现在还不适合一步到位宣称“完整 Durable Runtime 已完成”，原因是：
  - callback ingress、ticket TTL/过期态和周期自动清理已经落地，但 callback bus、更强鉴权和系统诊断治理可见性还没有完成
  - scheduler 还只有最小任务投递，没有 dead-letter、去重、重投和系统化观测
  - publish binding 虽然已经接上 compiled blueprint、lifecycle、alias/path、最小 native invoke、OpenAI / Anthropic 非流式入口、API key 实体和最小 rate limit，但发布托管能力与 streaming / 更完整协议映射还没有完全接上
- 因此后续应按 “Phase 1 MVP 稳定化 -> Phase 2 完整耐久化” 的路线推进，而不是再把所有能力堆回 `runtime.py`

### P0 当前最高优先级

1. 把开放 API 建在 publish binding + lifecycle + activity 上：
   - 继续把最小 `native / openai / anthropic` endpoint 演进成更完整的发布实体
   - 在已落地的 native async invoke + protocol async bridge 基础上，继续把 streaming / SSE 挂到同一条发布链和统一事件流上
2. 继续补 publish endpoint 的发布实体：
   - 在已落地的 binding 级筛选钻取、timeline breakdown、API key status mix / per-bucket trend、cache status timeline、run status timeline、`streaming_unsupported` rejection 可见性，以及 native async invoke + protocol async bridge 基础上，继续补长期趋势、waiting/async lifecycle drilldown 和长期审计面板
   - streaming / SSE 与 async invoke 的协议面可见性，以及 invocation / cache / API key / protocol surface 的统一前端治理区块
   - 继续坚持绑定 `workflow_version + compiled_blueprint`
3. 延续当前前端解耦方向：
   - 若 publish 治理继续扩张，优先把 `binding card` 内的 cache / lifecycle / API key 区块继续细拆
   - 继续避免把 workflow 编辑与 publish 治理动作重新堆回同一 server actions 文件

原因：

- 最小 `native` 调用入口、native async invoke、OpenAI / Anthropic 非流式入口、protocol async bridge、`api_key` 鉴权实体、alias/path 地址语义、基础 activity audit、publish cache inventory，以及 workflow 页治理入口都已经落地；现在又补上了 binding 级 `run_status` 过滤、run status summary/timeline 与 async waiting 可见性，但更细的治理反馈与真正的流式/协议完整度仍未接上，否则 `API 调用开放` 仍然无法从 MVP 走向可集成状态。
- run 侧虽然已经绑定 compiled blueprint，execution/evidence 视图也已经开始消费这些事实，但发布层仍需要继续承接，稳定执行边界才能真正服务主业务。
- 本轮已经把 publish governance 的页面拆分继续落实到 server actions 边界，下一轮应继续沿这个方向演进，而不是在新增治理能力时回退到单点混排。

### P1 次高优先级

1. 继续补强 scheduler / worker 的稳定性治理：
   - `run.resume.scheduled` 的查询与诊断入口
   - dead-letter / 失败重投 / 去重策略
   - 按 waiting type 区分 time-driven 与 event-driven 恢复
2. 继续补强 `llm_agent` 结构化配置：
   - 输出契约
   - assistant trigger 阈值
   - tool policy
   - timeout / fallback / review 策略
3. 继续扩展 `Tool Gateway`：
   - 参数 schema 校验
   - 权限控制收口
   - native / compat / local agent / remote API 适配
4. 把 execution view 和 evidence view 从 run diagnostics 继续接回 editor / node overlay：
   - 节点 phase timeline
   - tool 调用摘要
   - assistant evidence 展示
   - artifact 引用跳转
5. 继续控制长文件体量：
   - `web/components/workspace-starter-library.tsx`
   - `api/app/services/runtime.py`
   - `api/tests/test_runtime_service.py`

原因：

- scheduler 已经落了最小实现，下一步要尽快补齐“能排队”之外的可靠性与可观测性。
- 当前 `llm_agent` 已从单次调用器升级为复合节点，但还需要更多结构化配置才能真正承载“节点级智能性”。
- Tool Gateway 已经建立统一入口，应该继续成为所有工具能力的唯一穿透点，避免重新散落调用。
- execution/evidence 视图已经先接到 run diagnostics，下一步要把这套聚合事实继续回接 editor，而不是重新在画布侧拼第二套运行态协议。
- 当前前端 server actions 已按业务边界拆开，说明“先收口耦合点再继续加功能”是有效路径；同样策略应继续用于 runtime 与大型测试文件。

### P2 中优先级

1. 推进真正的 Event Bus / Worker Scheduler：
   - 异步工具完成事件
   - assistant 异步任务恢复
   - timer-based timeout / retry / fallback
   - callback / timer / manual 三类恢复来源统一收口
2. 开始补 Loop / Subflow 的运行时边界：
   - Loop 仍坚持显式节点表达
   - 某些复杂 assistant pipeline 未来可升级为 subflow，但当前先不提前抽象
3. 继续把 `workflow library`、节点目录和节点配置体验与新运行时对齐：
   - 让前端明确表达 phase、artifact、evidence 与 tool 权限模型

原因：

- P2 才是从 Phase 1 MVP 向完整 Durable Runtime 过渡的关键基础设施层。
- Loop / Subflow 与 assistant pipeline 的边界必须建立在现有 phase runtime 稳定后再推进，否则会过度设计。
- 运行时模型已经变了，创建页、编辑器和调试页也要逐步显式承认这些新事实。

### P3 后续优先级

1. 回到四条主业务线做整合推进：
   - 应用新建编排
   - 编排节点能力
   - Dify 插件兼容
   - API 调用开放
2. 在发布层继续推进 workflow-backed provider：
   - 从 compiled workflow + event bus 映射到原生 / OpenAI / Anthropic 风格接口
3. 当项目达到“主要功能完整、流程与数据流转稳定、界面能力基本可用”的阶段后，主动联系用户进行一次人工全链路完整测试。

原因：

- Durable Runtime 最终不是独立产品，而是要服务 7Flows 的四条主业务线。
- 发布层与兼容层必须建立在内部 runtime 边界稳定之后，不能反向主导内部设计。
- 人工全链路测试仍保留为阶段性收尾动作，但应放在主要闭环站稳之后。
