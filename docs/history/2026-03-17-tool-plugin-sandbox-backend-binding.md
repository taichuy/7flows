# 2026-03-17 tool / plugin sandbox backend binding

## 背景

- `docs/dev/runtime-foundation.md` 已把“把 graded execution 从代码节点扩到统一高风险执行主链”列为当前 `P0`。
- 上一轮已经让 `sandbox_code` 接入独立 `SandboxBackendRegistration / SandboxExecution` 主链，但高风险 `tool/plugin` 仍主要停留在“execution payload 透传到 compat adapter”的阶段。
- 这会造成一个现实缺口：代码节点已经会在 host 侧基于 backend capability 做 `fail-closed`，而 tool/plugin 即便显式请求 `sandbox / microvm`，也还没有统一的 backend 绑定与保存前 guard。

## 目标

- 让 compat `tool/plugin` 在显式请求 `sandbox / microvm` 时，也先经过 host 侧 sandbox backend 选择。
- 把选中的 backend 绑定信息透传给 compat adapter，避免 execution policy 继续停留在“只有提示，没有落地绑定”的状态。
- 把同样的可用性判断补到 workflow / workspace starter 保存前校验，避免 definition 能保存、运行时才 fail-closed。

## 本轮实现

### 1. sandbox backend client 增加 tool/plugin 绑定选择

- 更新 `api/app/services/sandbox_backends.py`
- 在现有 `describe_execution_backend()` 之外，新增 `describe_tool_execution_backend()`，复用同一套 backend 健康度、execution class、profile、network policy、filesystem policy 的 capability 选择逻辑。
- 这样 `sandbox_code` 与高风险 `tool/plugin` 可以共享同一条 backend selection 语义，而不是继续各自维护独立判断。

### 2. compat plugin dispatch 绑定 sandbox backend

- 更新 `api/app/services/plugin_execution_dispatch.py`
- 更新 `api/app/services/plugin_runtime_proxy.py`
- 当 compat tool 显式请求 `sandbox / microvm` 且 adapter 本身支持该 execution class 时，host 现在还会继续检查是否存在兼容且健康的 sandbox backend：
  - 有 backend：在 `effective_execution` 里附带 `sandboxBackend.id / executorRef`，再透传给 adapter 的 `/invoke`。
  - 无 backend：继续 `fail-closed`，不会静默退回 adapter host subprocess。
- 对 native tool 的当前事实保持不变：仍然是 `inline-only`，这条更严格的高风险分级语义仍属于后续缺口。

### 3. workflow / starter 保存前补 backend guard

- 更新 `api/app/services/workflow_tool_execution_validation.py`
- 更新 `api/app/services/workflow_definitions.py`
- 现在 definition 在保存前，不仅会检查 adapter 是否声明支持某个 execution class，还会检查显式请求的 `sandbox / microvm` 是否有兼容 sandbox backend。
- 这使 `workflow` 与 `workspace starter` 都能更早暴露“强隔离语义写进 definition 了，但当前环境没有 backend”的问题。

## 影响评估

### 架构链条

- **扩展性增强**：高风险执行不再只在 `sandbox_code` 节点可走 backend contract；compat tool/plugin 也开始复用同一条选择与绑定逻辑。
- **兼容性增强**：compat adapter 继续负责生态桥接，但“强隔离能不能执行”不再只看 adapter 自报，还要看统一 sandbox backend readiness。
- **可靠性 / 稳定性增强**：definition 保存前就能发现 backend 缺口，减少运行时才暴露 blocked 的滞后。
- **安全性增强**：显式 `sandbox / microvm` 请求现在会要求真实 backend 存在，减少“看起来声明了强隔离，实际没有隔离执行体”的假兑现。

### 对产品闭环的帮助

- 这轮推进的是 **AI 与人协作层 + AI 治理层** 的高优先级主链，而不是 UI 细枝末节。
- 场景落点：
  - **AI 使用 / 人与 AI 协作**：`llm_agent` 发起高风险 tool call 时，execution policy 不再只是写在 trace 上，而是开始绑定真实 backend。
  - **人类 operator / builder**：在保存 workflow / starter 时就能看见 backend readiness 缺口，少走一轮“发布后才发现 microvm 根本不可用”的排障。

## 验证

- 定向后端测试：
  - `api/.venv/Scripts/uv.exe run pytest -q tests/test_plugin_runtime.py tests/test_runtime_service.py tests/test_runtime_service_agent_runtime.py tests/test_workflow_routes.py tests/test_workspace_starter_routes.py`
  - 结果：`118 passed`
- 后端全量测试：
  - `api/.venv/Scripts/uv.exe run pytest -q`
  - 结果：`323 passed`

## 仍未完成的缺口

- compat adapter 当前只是收到 `sandboxBackend` 绑定信息；真正如何在 adapter / runner 内兑现到隔离执行体，还需要后续继续对接 adapter 实现与协议说明。
- native tool 仍然是 `inline-only`，还没有按高风险分级收进同一条 sandbox backend contract。
- profile / dependency governance 目前还停留在最小 capability gating，尚未形成 workflow-level / admin-level 的治理面。

## 下一步

1. 继续把 compat adapter 侧的 `sandboxBackend` 绑定兑现成真实隔离执行，而不是只停留在 host 侧选择与透传。
2. 为 native tool 设计 sensitivity-driven execution class 与 fail-closed 语义，避免高风险 native path 长期绕开统一隔离主链。
3. 继续推进 profile / dependency governance，明确哪些依赖语义进 core contract、哪些只留在 backend/profile/admin 扩展。
