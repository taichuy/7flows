# 2026-03-15 Runtime Execution Adapter MVP 落地

## 背景

- `153a20c feat: add runtime execution policy trace surface` 已把 `runtimePolicy.execution` 接到 schema、编辑器和 execution trace 可见面。
- `e8db456 docs: refresh status review and priorities` 又明确把“把 execution policy 从可见推进到可执行”列为当前最高优先级。
- 本轮目标不是重做 runtime，而是沿既有主线把分级执行真正接进后端执行链，并验证它不会破坏现有工作流主控与事件事实层。

## 目标

1. 为 runtime 增加统一的 execution adapter dispatch 落点。
2. 让 `sandbox_code` 节点先通过独立 host subprocess 跑通 MVP 执行链。
3. 对尚未实现的 `subprocess / sandbox / microvm` 非内联能力，至少输出明确 fallback trace，而不是静默吞掉 execution policy。
4. 保持 `RuntimeService` 仍是唯一 orchestration owner，不额外引入第二套流程控制语义。

## 实现

### 1. 新增 `RuntimeExecutionAdapterRegistry`

- 新增 `api/app/services/runtime_execution_adapters.py`。
- 通过 `NodeExecutionRequest` 把 `node`、`node_run`、`execution_policy`、授权上下文和 inline executor 封装成单一 dispatch 输入。
- `RuntimeNodeDispatchSupportMixin` 改为先解析 `execution_policy`，再把执行请求交给 registry；原有节点业务语义保留在 `_execute_node_inline()` 中。

### 2. `sandbox_code` 接入 host-subprocess MVP 执行链

- 新增 `api/app/services/runtime_sandbox_code.py`。
- 当前 MVP 仅支持 Python；执行方式是独立宿主子进程，不是假装已经完成真正重沙箱隔离。
- 子进程 envelope 会统一返回 `result / stdout / stderr`，并在主进程侧标准化为：
  - `sandbox_result` artifact
  - `sandbox_code.completed` runtime event
  - `node.execution.dispatched` / `node.execution.fallback` trace

### 3. 非 inline execution class 的 fallback trace

- 对普通节点，如果配置了尚未正式实现的 `subprocess / sandbox / microvm`，当前仍回退到 inline 执行。
- 但不再静默处理，而是显式写出 `node.execution.fallback` 事件，标记：
  - requested execution class
  - effective execution class
  - executor ref
  - fallback reason

## 影响范围

- `api/app/services/runtime.py`
- `api/app/services/runtime_node_dispatch_support.py`
- `api/app/services/runtime_execution_adapters.py`
- `api/app/services/runtime_sandbox_code.py`
- `api/tests/test_runtime_service.py`
- `docs/dev/runtime-foundation.md`

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run ruff check app/services/runtime.py app/services/runtime_node_dispatch_support.py app/services/runtime_execution_adapters.py app/services/runtime_sandbox_code.py tests/test_runtime_service.py
.\.venv\Scripts\uv.exe run pytest -q
```

结果：

- `ruff check`：通过
- `pytest -q`：通过，`221 passed`

本轮额外覆盖了两条新的 runtime 回归测试：

- `sandbox_code` 节点默认按 `sandbox` policy 进入 host-subprocess MVP 执行链，并落 artifact / dispatch / fallback event
- 普通 `tool` 节点在请求 `microvm` 时，会显式记录 fallback trace，而不是静默忽略 execution policy

## 当前结论

- `runtimePolicy.execution` 不再只是“配置 + trace 表面”，已经开始进入真实执行链。
- `RuntimeService` 仍保持唯一 workflow orchestration 主控，execution adapter 只是被调度层，没有反向长出第二套 runtime 状态机。
- 当前实现仍是 MVP：只有 `sandbox_code` 真正走了 host subprocess，其他节点对非 inline execution class 仍以 fallback trace 为主。

## 下一步

1. 把 ToolGateway 变成 execution-aware dispatch 入口，补齐 tool / plugin 默认 execution class 映射。
2. 在 `runtime_execution_adapters.py` 基础上继续扩真实 `sandbox` / `microvm` adapter，而不是长期依赖 host subprocess 替代。
3. 把 execution trace 摘要进一步接入 run diagnostics，区分 requested / effective execution boundary。
4. 继续把 sensitive access control 的拦截点挂到 ToolGateway、credential resolve、context read 和 publish export。
