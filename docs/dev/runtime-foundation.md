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

当前迁移会创建以下表：

- `workflows`
- `runs`
- `node_runs`
- `run_events`
- `run_artifacts`
- `tool_call_records`
- `ai_call_records`
- `run_callback_tickets`

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
  - 重复 callback 当前会按 `accepted / already_consumed / ignored` 做最小幂等处理

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
- `GET /api/runs/{run_id}/events`
- `GET /api/runs/{run_id}/trace`
- `GET /api/runs/{run_id}/trace/export`
- `GET /api/workflow-library`
- `GET /api/workflows/{workflow_id}/published-endpoints`
- `PATCH /api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run`

用途：

- 触发一次最小工作流执行
- 为 workflow editor 提供 workflow 级 recent runs 摘要入口
- 查询执行详情
- 读取按节点聚合的 execution facts，供 run diagnostics 和后续 editor 复用
- 读取 evidence-focused 视图，供 assistant/evidence 排障与回放入口复用
- 恢复处于 waiting 状态的 run
- 消费 `waiting_callback` ticket 并自动恢复 run
- 查询事件流
- 为 AI / 自动化 提供带过滤条件的 run trace 检索
- 为创建页和 editor 提供共享的 workflow library snapshot，统一暴露 builtin/workspace starters、node catalog、tool lanes 和 tools
- 为发布态治理与后续开放 API 提供独立的 publish binding 查询入口
- 为发布态治理提供最小 lifecycle 更新入口
- 沿 active publish binding 触发最小 native 发布调用
- `GET /api/workflow-library` 当前已开始按 `workspace_id` 过滤 adapter 绑定的 compat 工具，并把 `tool` 节点的 `binding_required` / `binding_source_lanes` 一并返回给 editor
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前默认返回 workflow 最新版本声明的 publish bindings，也支持按 `workflow_version` 或 `include_all_versions=true` 查看历史绑定
- `GET /api/workflows/{workflow_id}/published-endpoints` 当前还支持按 `lifecycle_status` 过滤 `draft / published / offline`
- `PATCH /api/workflows/{workflow_id}/published-endpoints/{binding_id}/lifecycle` 当前支持把 binding 切到 `published / offline`
- 同一 `workflow_id + endpoint_id` 下，新的 `published` binding 会自动把旧的已发布 binding 收口为 `offline`
- `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run` 当前只会命中 `published` binding，并固定执行 binding 指向的 `target_workflow_version + compiled_blueprint`
- 当前 `native` 发布调用仍保持 MVP 诚实边界：仅支持 `protocol=native`、`auth_mode=internal`、`streaming=false`
- `GET /api/workflows/{workflow_id}/runs` 当前会聚合返回 run 状态、版本、`node_run_count`、`event_count` 和 `last_event_at`，供 editor 选择最近执行上下文，而不是继续依赖首页摘要拼装
- `GET /api/runs/{run_id}` 当前已支持 `include_events=false` 的摘要模式，供 run 诊断页等人类界面减少与 `/trace` 的重复数据搬运
- `GET /api/runs/{run_id}/execution-view` 当前会把 `run_artifacts / tool_call_records / ai_call_records / run_callback_tickets` 聚合成节点级 execution facts
- `GET /api/runs/{run_id}/evidence-view` 当前会围绕 `node_runs.evidence_context`、assistant 调用、supporting artifacts 和 decision output 输出 evidence-focused 视图
- `POST /api/runs/{run_id}/resume` 当前会从 `runs.checkpoint_payload` 与 `node_runs.checkpoint_payload` 恢复 phase state machine；事件里会额外带出 `source`
- `POST /api/runs/callbacks/{ticket}` 当前会把 callback 结果写回 waiting tool 的 checkpoint / tool trace / artifact，再自动调用 `resume_run`
- runtime 当前还能通过 worker 侧 `runtime.resume_run` 消费被调度的 waiting run，并把计划恢复写成 `run.resume.scheduled`
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

- 最近一次 Git 提交 `2026-03-12 00:47:38 +0800` 的 `feat: add publish endpoint lifecycle`：
  - 把 `workflow_published_endpoints` 从“可查询 binding”推进到“带 `draft / published / offline` 生命周期的发布态事实”
  - 让同一 `endpoint_id` 的多版本 binding 具备明确的“发布新版本 -> 下线旧版本”切换语义
- 本轮继续承接这条主线，补上最小 `native` 发布调用入口：
  - 新增 `POST /v1/workflows/{workflow_id}/published-endpoints/{endpoint_id}/run`
  - 发布调用现在不再回退到最新 workflow 定义，而是固定走 `published binding -> target workflow version -> compiled blueprint`
- 当前真正需要持续承接的实现主线仍是 `feat: add durable agent runtime phase1`：
  - Phase 1 已经把 `compiler / runtime / agent runtime / tool gateway / context / artifact` 这套后端基础拆出来
  - 前几轮沿这条线补上了 `run_callback_tickets + callback ingress`
  - 这三轮把 publish binding、publish lifecycle 和最小 native publish invoke 接到 compiled blueprint 主线上，为开放 API 做最小承接
- 当前基础框架已经写到“可以继续推进主业务”的阶段：
  - `应用新建编排` 这一条线已经有 `workflow library -> starter -> editor -> 保存版本 -> recent runs overlay`
  - `编排节点能力` 这一条线已经有 phase runtime、tool/evidence/artifact、scheduler resume 和 callback ingress
  - `Dify 插件兼容` 已有 registry / adapter / tool lane / workspace scope 的基础 contract，但生命周期仍未完整
  - `API 调用开放` 已从纯设计占位推进到 `publish binding + lifecycle + native invoke` 最小闭环；但 alias/path、鉴权实体、限流/cache 与 OpenAI / Anthropic 映射还没真正接上
- 当前架构方向整体是解耦的，但仍有未完全拆开的高风险边界：
  - 后端已经开始形成 `Flow Compiler -> RuntimeService -> AgentRuntime / ToolGateway / ContextService / RunResumeScheduler / RunCallbackTicketService / WorkflowPublishBindingService` 的分层
  - execution / evidence 查询也已独立落到 `RunViewService + run_views route`，没有继续把聚合逻辑塞回 `runs.py`
  - publish binding 也已独立落到 `WorkflowPublishBindingService + workflow_publish route`，没有继续把发布态查询揉进 workflow detail 大包
  - publish invoke 现在也已独立落到 `PublishedEndpointGatewayService + published_gateway route`，没有把发布协议入口继续塞回 `runs.py` 或 `workflow_publish.py`
  - worker 恢复入口已经从运行主循环里旁路出来，没有继续把后台调度写死在 API 或 `RuntimeService` 单点内
  - 前端创建页、editor、starter 治理也已开始围绕共享 snapshot 演进，而不是各自维护私有常量
  - `run diagnostics` 新增 execution/evidence sections，但通过独立组件承接，没有继续把 `run-diagnostics-panel.tsx` 变成新的页面级大文件
  - 但 publish endpoint 的发布实体、protocol mapping、callback ticket 生命周期治理和节点插件注册中心仍未彻底拆清
- 当前需要显式盯住的长文件：
  - `api/app/services/runtime.py` 当前约 1552 行，已经超过后端 1500 行偏好上限；下一轮若继续补 scheduler、callback 治理或 publish gateway，应优先拆 execution / waiting / resume orchestration
  - `api/app/api/routes/runs.py` 仍然偏长，但本轮已把 execution / evidence 聚合和 RunDetail 序列化拆出；下一轮若继续扩展 trace/export/callback，应进一步考虑 trace/export/callback 子模块拆分
  - `api/app/services/agent_runtime.py` 当前约 665 行，已经承载 phase pipeline、tool waiting 恢复和 evidence 组装；若继续长出 assistant 策略与 subflow 候选能力，应提前拆 plan/tool/finalize 子阶段
  - `api/app/services/workflow_library.py` 当前约 688 行，仍适合继续演进，但若再接 adapter health / node plugin registry，应优先拆 source assembly 与 starter builder
  - `web/components/workspace-starter-library.tsx` 当前约 1134 行，是前端体量最大的真实业务文件；虽然还在前端 2000 行偏好之内，但后续继续补批量结果钻取时仍应继续拆
  - `web/components/workflow-editor-workbench.tsx` 当前约 580 行，下一轮若继续把 execution / evidence view 接回 editor overlay，要避免重新长回页面级混排组件

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

当前 worker 除 `system.heartbeat` 外，也会消费 `runtime.resume_run`，用于等待中的 run 自动恢复。

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
- publish endpoint 的鉴权实体、限流、cache 与 alias/path 治理
- `native` 发布调用的 streaming / SSE 与更完整发布管理
- `openai / anthropic` 的正式协议映射与开放调用入口
- scheduler 级 dead-letter / dedupe / metrics / 失败重投治理
- callback ticket 的过期、清理、来源审计与更强鉴权
- 回放调试面板
- 更完整的节点结构化配置抽屉
- editor 内消费 execution/evidence view、逐事件回放、trace 过滤和实时调试联动
- 节点目录与插件注册中心打通后的动态 starter / 节点库模型
- workspace starter 的批量结果钻取、字段级治理决策提示和更细的团队审阅反馈
- 前端 editor 测试基线

## 下一步建议

每轮开发结束后，这里的“下一步建议”都应同步刷新为按优先级排序的可执行计划。当前建议顺序如下。

当前判断：

- 本轮已经把 `compiled blueprint / version snapshot / run binding` 继续推进到 `publish binding + lifecycle + native invoke`。
- 发布态现在已经具备最小 native 调用闭环，但距离完整开放 API 仍差发布实体、鉴权、流式与兼容协议映射。
- 现在还不适合一步到位宣称“完整 Durable Runtime 已完成”，原因是：
  - callback ingress 已经落地，但 callback bus、ticket 生命周期治理和更强鉴权还没有完成
  - scheduler 还只有最小任务投递，没有 dead-letter、去重、重投和系统化观测
  - publish binding 虽然已经接上 compiled blueprint、lifecycle 和最小 native invoke，但发布实体与协议映射还没有完全接上
- 因此后续应按 “Phase 1 MVP 稳定化 -> Phase 2 完整耐久化” 的路线推进，而不是再把所有能力堆回 `runtime.py`

### P0 当前最高优先级

1. 把开放 API 建在 publish binding + lifecycle 上：
   - 继续把最小 `native` endpoint 演进成可发布实体
   - 再把 OpenAI / Anthropic 协议映射挂到同一条发布链上
2. 继续补 publish endpoint 的发布实体：
   - alias/path
   - 鉴权
   - 限流与 cache
   - 继续坚持绑定 `workflow_version + compiled_blueprint`
3. 收口 callback ticket 的剩余治理：
   - 过期/清理策略
   - 来源审计
   - 更强鉴权形态

原因：

- 最小 `native` 调用入口已经落地，当前最该补的是发布实体与兼容协议映射，否则 `API 调用开放` 仍然无法从 MVP 走向可集成状态。
- run 侧虽然已经绑定 compiled blueprint，execution/evidence 视图也已经开始消费这些事实，但发布层仍需要继续承接，稳定执行边界才能真正服务主业务。
- callback ingress 虽然已打通，但 ticket 生命周期治理仍属于 durable runtime 稳定化的一部分。

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

原因：

- scheduler 已经落了最小实现，下一步要尽快补齐“能排队”之外的可靠性与可观测性。
- 当前 `llm_agent` 已从单次调用器升级为复合节点，但还需要更多结构化配置才能真正承载“节点级智能性”。
- Tool Gateway 已经建立统一入口，应该继续成为所有工具能力的唯一穿透点，避免重新散落调用。
- execution/evidence 视图已经先接到 run diagnostics，下一步要把这套聚合事实继续回接 editor，而不是重新在画布侧拼第二套运行态协议。

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
