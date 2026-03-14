# 2026-03-15 ToolGateway execution-aware dispatch 落地

## 背景

- `cd1611b feat: add runtime execution adapter mvp` 已把 node 级 execution adapter、`sandbox_code` host-subprocess MVP 和 `node.execution.fallback` 接进 runtime 主链。
- 但当时 execution policy 主要还停留在 node 级：ToolGateway、普通 tool node 与 `llm_agent` 内部工具调用仍缺少统一的 execution-aware dispatch，导致 tool/plugin 的执行边界既没有默认映射，也没有统一 trace。
- `docs/dev/runtime-foundation.md` 已明确把“补 ToolGateway execution-aware dispatch、tool/plugin 默认 execution class 映射”列为当前最高优先级的一部分，因此本轮继续承接，而不是切到新方向。

## 目标

1. 让 ToolGateway 真正理解 tool/plugin 的 execution policy，而不是只在 node input 里保留配置表面。
2. 为 native / compat tool 建立默认 execution class 映射，避免默认都被误判成 `inline`。
3. 让 tool node 与 `llm_agent` 内部工具调用都把 execution dispatch / fallback 写回统一事件流与 artifact metadata。
4. 保持 `RuntimeService` 仍是唯一 orchestration 主控，不给 ToolGateway 额外长出第二套流程控制语义。

## 实现

### 1. Tool execution policy 进入后端事实层

- 在 `api/app/services/runtime_execution_policy.py` 新增 `default_execution_class_for_tool_ecosystem()` 与 `resolve_tool_execution_policy()`。
- 当前默认策略是：
  - `native` tool 默认 `inline`
  - 非 `native` compat tool 默认 `subprocess`
- `WorkflowNodeToolPolicy` 与 `WorkflowNodeAgentToolCall` 明确开放 `execution` 字段；`AgentToolCall` 也同步持久化 `execution`，避免 mock plan / checkpoint 在恢复时丢失工具执行边界。

### 2. ToolGateway 接入 execution-aware dispatch

- `api/app/services/tool_gateway.py` 新增 `execution_policy` 入参，并在执行前解析出：
  - `requested_execution_class`
  - `effective_execution_class`
  - `execution_source`
  - `executor_ref`
  - `fallback_reason`
- 这些信息会被同时写入：
  - `ToolExecutionResult.meta`
  - `tool_result` artifact 的 `metadata_payload`
- 当前 native tool 仍以 `inline` 为有效执行边界；compat tool 当前统一视作经 adapter service 桥接的 `subprocess` 边界。若请求的 class 尚未真正实现，会显式产生 fallback trace，而不是静默忽略。

### 3. 统一 tool execution 事件

- 新增 `api/app/services/tool_execution_events.py`，统一从 `ToolExecutionResult.meta` 生成：
  - `tool.execution.dispatched`
  - `tool.execution.fallback`
- `api/app/services/runtime_node_dispatch_support.py` 现在会在 tool node 的 `tool.completed` 之前写出 tool execution 事件。
- `api/app/services/agent_runtime.py` 现在会在 `llm_agent` 的工具调用返回后写出同样的 tool execution 事件，因此 `tool node` 和 `llm_agent` 两条主链现在共享同一套 tool execution trace 语义。

## 影响范围

- `api/app/services/runtime_execution_policy.py`
- `api/app/services/tool_gateway.py`
- `api/app/services/tool_execution_events.py`
- `api/app/services/runtime_node_dispatch_support.py`
- `api/app/services/agent_runtime.py`
- `api/app/services/agent_runtime_llm_support.py`
- `api/app/services/runtime_types.py`
- `api/app/schemas/workflow.py`
- `api/tests/test_runtime_service.py`
- `api/tests/test_runtime_service_agent_runtime.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest -q tests/test_runtime_service.py -k execution
.\.venv\Scripts\uv.exe run pytest -q tests/test_runtime_service_agent_runtime.py -k execution
.\.venv\Scripts\uv.exe run ruff check app/services/runtime_types.py app/services/runtime_execution_policy.py app/schemas/workflow.py app/services/agent_runtime_llm_support.py app/services/tool_execution_events.py app/services/tool_gateway.py app/services/runtime_node_dispatch_support.py app/services/agent_runtime.py tests/test_runtime_service.py tests/test_runtime_service_agent_runtime.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- execution 相关定向测试通过
- 本轮改动相关 `ruff check` 通过
- 后端全量测试通过：`222 passed`

## 当前结论

- 基础框架已经足够继续承接功能性开发，尤其是 runtime / tool / agent 三条执行主链现在开始共用 execution policy 语义，而不再是只有 node 级 trace。
- 架构仍保持在正确边界内：`RuntimeService` 继续掌握唯一 orchestration 主控，ToolGateway 只负责工具调用边界与 trace，不拥有第二套流程状态机。
- 兼容性与扩展性继续提升：tool execution 语义已经不再绑死 node type，可以继续向 compat plugin、sandbox tool adapter 与未来 microvm adapter 扩展。
- 当前仍是 MVP：tool execution 已经有统一 trace 和默认映射，但真实 `sandbox` / `microvm` tool adapter、敏感访问拦截和 approval/notification 闭环还未完成。

## 下一步

1. 把 ToolGateway 从“execution-aware”继续推进到真实 `sandbox` / `microvm` tool adapter。
2. 把 compat plugin adapter 的执行边界与 execution trace 摘要进一步接到 run diagnostics / published trace surface。
3. 把 `sensitivity_level` 的统一拦截挂到 ToolGateway、credential resolve、context read 和 publish export 入口。
