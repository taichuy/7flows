# 2026-03-11 Durable Agent Runtime Phase 1

## 背景

在本轮重构前，7Flows 的运行时已经具备最小的 workflow 执行闭环，但距离“Durable Agent Workflow Runtime”还有几处关键断层：

- `llm_agent` 更像一次性的模型调用器，而不是节点级智能执行单元
- 工具调用没有统一网关，结果标准化、权限边界和追踪沉淀不够集中
- 上下文仍偏向“直接在节点之间传 payload”，缺少 evidence / artifact 分层
- `runs` / `node_runs` 虽然已经存在，但节点执行仍偏同步链式调用，waiting / resume / phase 切换能力不足
- 原始大结果没有稳定进入 artifact 层，后续很难支撑 AI 追溯、证据视图和低噪音 prompt 构建

同时，当前项目还没有独立的 queue / scheduler / callback bus。如果现在强行一步到位宣称“完整 Durable Runtime”，会把未来能力伪装成已完成实现。

## 目标

本轮目标不是把最终形态一次性做完，而是落地一个能真实运行、能追溯、能继续演进的 Phase 1 MVP：

1. 把节点执行升级为可恢复的 phase state machine 风格
2. 把 `llm_agent` 升级为节点内可插拔的复合 Agent Runtime
3. 把工具调用统一收口到 Tool Gateway
4. 把上下文拆成 global / working / evidence / artifact 四层
5. 把 artifact、tool call、AI call 变成独立事实记录
6. 保留旧节点与 assistant = false 的兼容路径

## 实现决策

### 1. 引入最小编译层，而不是让设计态 JSON 直接进入执行

新增：

- `api/app/services/flow_compiler.py`
- `api/app/services/runtime_types.py`

当前做法：

- 使用 `WorkflowDefinitionDocument` 做运行前编译
- 生成 `CompiledWorkflowBlueprint`
- 固化节点、边、拓扑顺序、变量和输入输出关系

这还是最小编译层，但已经把“设计态结构”和“运行态蓝图”拆开，为后续 publish snapshot 留出边界。

### 2. RuntimeService 改为 phase state machine 风格执行器

核心文件：

- `api/app/services/runtime.py`
- `api/app/services/runtime_graph_support.py`

当前节点 phase 主要包括：

- `preparing`
- `running_main`
- `waiting_tool`
- `running_assistant`
- `finalizing`
- `succeeded`
- `failed`

运行时会把 checkpoint 写入：

- `runs.checkpoint_payload`
- `runs.current_node_id`
- `node_runs.checkpoint_payload`

这样 waiting 场景下不再要求单个长 HTTP 请求始终存活。

### 3. `llm_agent` 升级为节点内复合 Agent Runtime

新增：

- `api/app/services/agent_runtime.py`

当前内部 pipeline：

1. `prepare`
2. `main_plan`
3. `tool_execute`
4. `assistant_distill`
5. `main_finalize`
6. `emit_output`

关键边界：

- 主 AI 仍是唯一最终决策者
- assistant 只做工具结果压缩、摘要和 evidence 提炼
- assistant 默认不拥有工具权限
- assistant 可关闭，关闭后退化为更接近旧逻辑的单主 AI 输出

这说明 assistant 更适合作为“节点内可插拔 pipeline”，而不是独立工作流节点。

### 4. Tool Gateway 成为统一工具调用入口

新增：

- `api/app/services/tool_gateway.py`

当前负责：

- 统一走 `PluginCallProxy`
- 标准化工具返回
- 把原始结果写入 `run_artifacts`
- 把摘要写入 `tool_call_records`
- 为后续权限控制、schema 校验、native / compat / local agent 扩展预留入口

### 5. Context Service 把上下文显式分层

新增：

- `api/app/services/context_service.py`
- `api/app/services/artifact_store.py`

当前分层：

- `global_context`
- `working_context`
- `evidence_context`
- `artifact_refs`

约束：

- 原始大结果优先进入 artifact
- 主 AI 优先消费 evidence
- artifact 作为审计、追溯、调试和回看入口

### 6. 运行态持久化模型继续扩充，而不是另起临时日志体系

修改：

- `api/app/models/run.py`
- `api/app/schemas/run.py`
- `api/migrations/versions/20260311_0007_durable_agent_runtime.py`

新增持久化事实：

- `run_artifacts`
- `tool_call_records`
- `ai_call_records`

扩展字段：

- `runs.current_node_id`
- `runs.checkpoint_payload`
- `node_runs.phase`
- `node_runs.retry_count`
- `node_runs.working_context`
- `node_runs.evidence_context`
- `node_runs.artifact_refs`
- `node_runs.waiting_reason`

### 7. API 与前端只补最小可用面

后端新增：

- `POST /api/runs/{run_id}/resume`

前端补充：

- `llm_agent` assistant 开关
- assistant trigger 选择

当前没有假装把 execution view / evidence view 全部做完，只先补最小配置入口。

## 兼容策略

### 1. 旧节点继续执行

- `trigger` / `output` / `tool` / `mcp_query` / `condition` / `router` 仍沿用现有执行路径
- 新 runtime 主要把执行壳层升级为可追溯、可恢复的 phase runtime

### 2. 旧 AI 节点通过 `assistant.enabled = false` 兼容

- 不开启 assistant 时，`llm_agent` 仍由主 AI 直接产出最终结果
- 如果声明了 `mockPlan` / `fallbackOutput`，也能维持测试和迁移期的稳定行为

### 3. 旧上下文流平滑过渡

- 旧的节点输入输出仍可继续在 `upstream` / `accumulated` 中读取
- 新 runtime 在内部额外维护 `working_context`、`evidence_context` 和 `artifact_refs`
- 这允许旧流程继续跑，新流程逐步显式使用新的上下文字段

### 4. 数据迁移脚本是必须的

- 本轮已新增 `20260311_0007_durable_agent_runtime.py`
- 这是运行时事实升级，不适合只靠运行时代码临时兼容

### 5. 当前暂不额外引入 feature flag

- `durable_agent_runtime_enabled` 已在配置层预留
- 但当前实现已经保持旧节点兼容，因此先不让系统长期背负两套执行器

## 影响范围

- 运行时执行：`api/app/services/runtime.py`
- 图执行辅助：`api/app/services/runtime_graph_support.py`
- 编译层：`api/app/services/flow_compiler.py`
- Agent Runtime：`api/app/services/agent_runtime.py`
- Tool Gateway：`api/app/services/tool_gateway.py`
- 上下文 / artifact：`api/app/services/context_service.py`、`api/app/services/artifact_store.py`
- 运行态模型：`api/app/models/run.py`
- 路由输出：`api/app/api/routes/runs.py`
- 工作流 schema：`api/app/schemas/workflow.py`
- 节点配置 UI：`web/components/workflow-node-config-form/llm-agent-node-config-form.tsx`

## 验证

已完成验证：

- `api/.venv/Scripts/python -m pytest tests/test_runtime_service.py -q`
- `api/.venv/Scripts/python -m pytest tests/test_run_routes.py -q`
- `api/.venv/Scripts/python -m pytest tests/test_plugin_runtime.py -q`
- `api/.venv/Scripts/python -m pytest tests/test_workflow_routes.py -q`
- `api/.venv/Scripts/python -m pytest -q`
- `api/.venv/Scripts/python -m ruff check ...`
- `web/pnpm exec tsc --noEmit`

重点覆盖：

- assistant 关闭时仍可保持旧式结果路径
- assistant 开启时 evidence 会写入节点运行态
- 工具原始结果会进入 artifact
- waiting tool 场景可通过 resume 恢复

## Phase 1 MVP 与 Phase 2 路线

### Phase 1 MVP（本轮已完成）

- phase state machine 风格执行器
- 复合 `llm_agent`
- Tool Gateway
- evidence / artifact 分层
- artifact / tool / AI 持久化记录
- resume API

### Phase 2（后续演进）

- 独立 scheduler / queue / callback bus
- `WAITING_CALLBACK` 与延迟重试的后台唤醒
- 发布态 compiled blueprint 固化与绑定
- 更完整的 tool schema 校验 / 权限控制
- execution view / evidence view
- Loop / Subflow 与更复杂 durable semantics

## 未决问题

1. 当前还没有独立 worker scheduler，`resume` 仍主要是显式入口而不是事件驱动恢复。
2. `assistant` 目前更像 evidence distiller；未来若出现复杂多阶段认知流程，可能更适合升级为 subflow，但当前不提前抽象。
3. 运行态事实已经足够支撑 execution view，但前端还没有把 artifact / evidence / AI phase 完整呈现出来。
