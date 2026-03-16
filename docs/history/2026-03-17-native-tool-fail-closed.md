# 2026-03-17 native tool explicit isolation fail-closed

## 背景

- `runtime-foundation` 的 `P0` 一直把 graded execution / sandbox isolation 视为高优先级主线。
- 2026-03-17 上一轮提交 `fde10c6 feat: expose sandbox backend bindings in run diagnostics` 已把 compat `tool/plugin` 的 sandbox backend 绑定事实补到了 run diagnostics。
- 但复核后仍有一个明显缺口：native tool 在显式声明 `sandbox / microvm` 时，host 侧仍会静默改成 `inline` 并继续执行。这会让“强隔离声明必须诚实兑现或 fail-closed”的安全边界在 native path 上失真。

## 目标

- 把 native tool 的显式强隔离请求从“静默 fallback”改成“显式阻断”。
- 继续复用同一条 execution dispatch / trace 主链，而不是为 native tool 另起第二套安全语义。
- 让 run 失败原因、tool execution trace 与测试基线一起对齐当前安全边界。

## 实现

### 1. native tool dispatch 改为 fail-closed

- 更新 `api/app/services/plugin_execution_dispatch.py`
- 当 native tool 收到显式 `tool_call / tool_policy / runtime_policy` 来源的非 `inline` 请求时：
  - 不再写 `fallback_reason = native_tools_currently_inline_only`
  - 改为写入 `blocked_reason`
  - 阻断文案明确说明：在 native sandbox execution path 真正实现前，显式 `sandbox / microvm` 请求必须 fail-closed

### 2. proxy / runtime 测试同步改成阻断语义

- 更新 `api/tests/test_plugin_runtime.py`
  - 新增 proxy 级测试，直接验证 native tool 的显式 `sandbox` 请求会被 `PluginInvocationError` 阻断
- 更新 `api/tests/test_runtime_service.py`
  - tool node 显式请求 `microvm` 时，现在应导致 run failed，并保留 `tool.execution.dispatched` / `tool.execution.blocked`
- 更新 `api/tests/test_runtime_service_agent_runtime.py`
  - `toolPolicy.execution` 显式 `sandbox`
  - 单次 `toolCall.execution` 显式 `microvm`
  - 以上两条 native path 现在都改成 fail-closed，并验证 run / node run / event 留痕

## 影响范围

### 架构链条

- **安全性增强**：native tool 不再吞掉强隔离声明，显式风险要求会诚实阻断。
- **可靠性增强**：run failed 原因与 execution trace 对齐，不再出现“表面声明高隔离、实际仍 inline 执行”的错觉。
- **稳定性增强**：execution dispatch 的 fail-closed 规则在 `sandbox_code / compat tool / native tool` 三条路径上更一致。
- **扩展性增强**：后续真正为 native tool 接入 sandbox backend contract 时，可以沿现有 blocked -> available 演进，而不是先推翻静默 fallback 语义。

### 对产品闭环的帮助

- 这轮推进的是 **AI 与人协作层 + AI 治理层** 的主业务闭环，不是样式微调。
- **AI 使用 / 人与 AI 协作**：AI 或 workflow 作者如果为 native tool 明确声明高隔离，系统现在会诚实告诉他们“当前做不到”，而不是偷偷改回宿主执行。
- **AI 治理层**：operator 在 run diagnostics / trace 中看到的 execution 事实与真实运行边界更一致，更适合支撑“安全可靠可信”的链路判断。

## 验证

- 定向测试：`api/.venv/Scripts/uv.exe run pytest -q tests/test_plugin_runtime.py tests/test_runtime_service.py tests/test_runtime_service_agent_runtime.py`
  - 结果：`49 passed in 7.27s`
- 后端全量测试：`api/.venv/Scripts/uv.exe run pytest -q`
  - 结果：`325 passed in 45.07s`

## 未完成与下一步

1. 把 native tool 真正接入统一 `SandboxBackendRegistration / SandboxExecution` contract，而不只是先做到 fail-closed honesty。
2. 继续把高风险 native tool 的 sensitivity-driven execution class 策略收口到统一治理入口。
3. 把 native tool 的 blocked reason 进一步汇总到更显眼的 diagnostics / system readiness 视图，减少 operator 只看 raw events 的成本。
