# 2026-03-17 native tool sandbox binding

## 背景

- `docs/dev/runtime-foundation.md` 已把“把 graded execution 从代码节点隔离，扩成统一高风险执行主链”列为当前 `P0`。
- 此前 `sandbox_code` 已能真实绑定 `SandboxBackendRegistration / SandboxExecution`，compat `tool/plugin` 也已接入 host-side backend selection；但 native tool 仍停留在“显式 `sandbox / microvm` 统一 fail-closed，且只能视为 inline-only”的状态。
- 这会留下一个现实断点：作者、operator 与 AI 都能在 system overview / editor preflight 里看见强隔离 readiness，但 native tool 依旧不能声明“这个工具已经具备 host-bound sandbox backend contract”，导致高风险 native path 仍只能二选一：要么 inline，要么 blocked。

## 目标

- 让 native tool 可以显式声明自身支持的 `supported_execution_classes`，而不是继续被平台硬编码成统一 `inline-only`。
- 当 native tool 显式请求 `sandbox / microvm` 且声明支持时，复用现有 sandbox backend selection，把 `sandboxBackend.id / executorRef` 绑定进 effective execution payload。
- 把同样的能力声明同步到 tool registry / workflow library / definition validation / editor preflight，避免 runtime、API 和作者侧看到不同事实。

## 本轮实现

### 1. native tool 增加 execution capability 声明

- 更新 `api/app/services/plugin_runtime_types.py`
- `PluginToolDefinition` 现新增 `supported_execution_classes`，并对 native tool 默认归一为 `inline`。
- 这样原生工具可以显式声明自己支持 `inline / subprocess / sandbox / microvm` 中的哪些执行等级，而不是被全局写死成单一语义。

### 2. native dispatch 接入 host-bound sandbox backend selection

- 更新 `api/app/services/plugin_execution_dispatch.py`
- 更新 `api/app/services/plugin_runtime_proxy.py`
- native tool 在声明支持 `sandbox / microvm` 时，现在会：
  - 先经过 host 侧 `describe_tool_execution_backend()` 选择兼容 backend
  - 有 backend 时，把 `sandboxBackend.id / executorRef` 绑定到 effective execution
  - 没有 backend 时继续 fail-closed，不会假装已具备强隔离
- `PluginCallProxy` 现在会把绑定后的 execution payload 传给 native invoker，这样 backend-aware native tool 已经可以复用同一条主链，而不是只能靠外层 trace 文案表达“理论上应该隔离”。

### 3. 工具目录与作者侧校验同步到同一事实

- 更新 `api/app/schemas/plugin.py`
- 更新 `api/app/api/routes/plugins.py`
- 更新 `api/app/services/workflow_library.py`
- 更新 `api/app/services/workflow_tool_execution_validation.py`
- 更新 `web/lib/get-plugin-registry.ts`
- 更新 `web/lib/get-workflow-library.ts`
- 更新 `web/lib/workflow-tool-execution-validation-helpers.ts`
- `/api/plugins/tools`、workflow library snapshot 与 editor preflight 现在都能看到 tool-level `supported_execution_classes`。
- 作者在 workflow / starter 保存前不再被 native tool 一刀切判成“只能 inline”；如果某个 native tool 已声明支持 `sandbox / microvm`，校验会继续走 sandbox readiness 主链，而不是在 tool type 这一层直接误拦。

## 影响评估

### 架构链条

- **扩展性增强**：native tool 开始具备 tool-level execution capability 声明，后续新增高风险原生工具时不必再把隔离能力硬编码进 planner 特判。
- **兼容性增强**：tool registry、workflow library、backend validation 与 editor preflight 统一消费同一份 tool execution 能力事实，减少前后端判断漂移。
- **可靠性 / 稳定性增强**：native tool 在声明强隔离能力时，会和 compat tool 一样先经过 backend readiness 选择，不再出现“作者侧说能配，运行时却仍按 inline-only 理解”的割裂。
- **安全性增强**：native tool 的强隔离语义开始进入统一 sandbox backend 主链；声明支持但没有兼容 backend 时，仍保持 fail-closed。

### 对产品闭环的帮助

- 这轮推进的是 **AI 使用 + 人与 AI 协作 + AI 治理层** 的共同主线，不是细枝末节修补。
- 具体场景：
  - **AI 使用**：`llm_agent` 或 tool node 显式请求 native tool 的 `sandbox / microvm` 时，runtime 不再只能回答“native 一律 inline”，而是能识别“这个具体工具是否声明支持强隔离”。
  - **人与 AI 协作**：作者在保存 workflow 前就能知道某个 native tool 的强隔离声明是否能真正落到 backend readiness，而不是上线后才发现语义没兑现。
  - **AI 治理层**：tool-level capability 现在进入统一 trace / preflight / registry 主链，为后续把敏感级别、默认 execution class 和治理策略继续收口提供了事实基础。

## 验证

- 定向测试：`api/.venv/Scripts/uv.exe run pytest -q tests/test_plugin_runtime.py tests/test_plugin_routes.py tests/test_workflow_routes.py`
  - 结果：`70 passed`
- 后端全量测试：`api/.venv/Scripts/uv.exe run pytest -q`
  - 结果：`334 passed in 34.59s`
- 后端静态检查：
  - `api/.venv/Scripts/uv.exe run ruff check app/services/plugin_runtime_types.py app/services/plugin_execution_dispatch.py app/services/plugin_runtime_proxy.py app/schemas/plugin.py app/api/routes/plugins.py app/services/workflow_library.py app/services/workflow_tool_execution_validation.py tests/test_plugin_runtime.py tests/test_plugin_routes.py tests/test_workflow_routes.py tests/test_runtime_service.py tests/test_runtime_service_agent_runtime.py`
  - 结果：通过
- 前端类型检查：`web/pnpm exec tsc --noEmit`
  - 结果：通过
- 前端 lint：`web/pnpm lint`
  - 结果：通过
- diff 检查：`git diff --check`
  - 结果：通过（仅保留 CRLF warning，无 diff error）

## 未完成与下一步

1. 当前只是让 native tool 具备 host-bound sandbox backend contract；native invoker 是否真正把绑定兑现成隔离执行，仍取决于具体工具实现，还没有形成统一的 native sandbox executor facade。
2. native tool 还没有按 `sensitivity_level` 或 tool catalog 风险分级自动收敛默认 execution class；当前更多是“已声明能力的工具可以接入主链”，还不是“高风险 native tool 默认就按强隔离执行”。
3. 下一步优先把高风险 native tool 的默认 execution / sensitivity 规则收口，再继续推进 compat adapter 侧的真实隔离兑现与 profile / dependency governance。
