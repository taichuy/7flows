# 2026-03-16 sandbox_code fail-closed 与 host-subprocess 显式受控路径

## 背景

- 用户要求先阅读 `AGENTS.md`、`docs/dev/user-preferences.md`、`docs/product-design.md`、`docs/technical-design-supplement.md`、`docs/open-source-commercial-strategy.md`、`docs/dev/runtime-foundation.md`，结合最近 Git 提交与 `docs/history/` 判断项目现状，并按优先级继续推进。
- 最近一轮正式提交 `1ffa160 feat: guard workflow tool execution capabilities` 已把 workflow / starter 的 tool execution capability honesty 前移到 save-time，避免不支持的 `adapterId` / `execution.class` 被静默沉淀到 definition。
- 继续复核 runtime 主链时，发现 `sandbox_code` 仍保留“默认请求 `sandbox`，运行时静默退回 host-subprocess”的旧 MVP 行为，这与仓库已经写清楚的边界不一致：
  - `AGENTS.md` 要求强隔离必需路径在没有兼容且健康的 sandbox backend 时 `fail-closed`；
  - `docs/product-design.md` 明确 `sandbox_code` 默认以 `sandbox` 为目标执行类，缺 backend 时应 `blocked / unavailable`；
  - `docs/dev/user-preferences.md` 也已记录“开源默认轻执行，但强隔离路径 fail-closed”。

## 目标

1. 把 `sandbox_code` 的 runtime 行为对齐到当前设计边界，不再静默退回宿主 host-subprocess。
2. 保留一个诚实的过渡路径：只有显式声明 `execution.class = subprocess` 时，才允许继续走当前 host-subprocess MVP。
3. 给 runtime trace 补上明确的 unavailable / blocked 信号，便于后续 operator diagnostics 与 sandbox backend 接入继续演进。

## 实现

### 1. RuntimeExecutionAdapterRegistry 新增 availability gate

- 在 `api/app/services/runtime_execution_adapters.py` 增加 `NodeExecutionAvailability`，让 node runtime 在真正执行前先判断当前 execution class 是否可用。
- 当前策略收敛为：
  - 非 `sandbox_code` 节点：保持现有 inline / fallback 行为。
  - `sandbox_code + subprocess`：允许进入当前 host-subprocess MVP 路径。
  - `sandbox_code + sandbox|microvm`：若没有已注册 backend，直接判定 unavailable。
  - `sandbox_code + inline`：同样 unavailable，避免代码节点退回更弱的宿主 inline 执行。

### 2. node preparation 阶段显式 blocked

- 在 `api/app/services/runtime_node_preparation_support.py` 中，node run 从 `running` 前先调用 availability gate。
- 若 execution unavailable：
  - 创建 `status = blocked` 的 `NodeRun`；
  - 记录 `node.execution.unavailable` 与 `node.blocked` 事件；
  - 让 run 以明确错误结束，而不是执行后才发现是“假沙箱”。

### 3. host-subprocess 只保留显式 opt-in MVP 语义

- `SandboxCodeExecutionAdapter` 现在只接受显式 `execution.class = subprocess`。
- `node.execution.dispatched` 事件也补上 `effective_execution_class = subprocess`，不再伪装成默认 `sandbox` 已被兑现。

## 影响范围

- `sandbox_code` 的默认 runtime 语义与文档边界重新一致。
- 后续接入真实 `SandboxBackendRegistration / SandboxExecution` 时，可以直接沿 availability gate 扩展，而不必再先拆除 silent fallback 旧行为。
- 当前 host-subprocess 仍保留最小实验路径，但已经从“默认降级”改成“显式 opt-in 的受控路径”，更符合 MVP 诚实性。

## 验证

在 `api/` 目录执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests/test_runtime_service.py -q
.\.venv\Scripts\uv.exe run pytest tests/test_runtime_service_agent_runtime.py -q
.\.venv\Scripts\uv.exe run ruff check app/services/runtime_execution_adapters.py app/services/runtime_node_preparation_support.py tests/test_runtime_service.py
```

结果：

- `tests/test_runtime_service.py -q`：`22 passed`
- `tests/test_runtime_service_agent_runtime.py -q`：`10 passed`
- `ruff check`：通过

## 结论

- 上一轮正式开发留痕需要衔接，而且这轮就是直接沿着“execution capability honesty”继续往 runtime 主链推进，而不是另起一条基础框架支线。
- 当前项目的基础框架仍然足够继续做功能、兼容、稳定性和安全性建设；这轮修的是一个真实的架构/安全边界缺口，而不是表层重构。
- `sandbox_code` 仍未进入正式产品主链，但现在至少不会再以默认静默降级的方式假装“sandbox 已可用”。

## 下一步建议

1. **P0：补真实 sandbox backend registration / execution path**
   - 让 `sandbox_code` 与高风险 `tool/plugin` 共用同一条 backend contract，而不是继续停留在 host-side gate。
2. **P0：把 tool/plugin 的强隔离路径继续收口到同一套 fail-closed 语义**
   - 当前 tool execution 已有 save-time honesty；下一步应继续推进 runtime dispatch 的强隔离兑现与 unavailable 表达。
3. **P1：给 execution diagnostics 补更明显的 blocked/unavailable summary**
   - 让 operator 在 run detail / diagnostics 页面更快区分“策略阻断”“backend 缺失”和“真正执行失败”。
