# 2026-03-17 llm_agent toolPolicy execution scope guard

## 背景

- `docs/dev/runtime-foundation.md` 的 `P0 sandbox / protocol` 主线已经先后补上了 compat tool/plugin 的 sandbox backend binding、native tool 显式强隔离请求 fail-closed，以及首页 / system overview 的 sandbox readiness 摘要。
- 但继续复核作者侧链路后，仍有一个会直接影响“安全可靠可信”体验的缺口：`llm_agent` 可以在 `toolPolicy.execution` 里显式声明 `sandbox / microvm`，却不写 `allowedToolIds`。
- 在这种 definition 下，运行时虽然会在 AI 真正挑到 native 或其他不兼容工具时 fail-closed，但保存阶段并不会提前指出“这个 Agent 仍对整份 workspace tool catalog 开放，强隔离目标并没有真正收口到兼容工具集”。

## 目标

- 把这类“显式强隔离目标 + 未收口工具范围”的风险前移到 workflow / workspace starter 保存前。
- 保持与 runtime fail-closed 同一条治理语义，不额外引入第二套 tool policy 安全模型。
- 同步补前端 editor preflight，避免前后端规则再次漂移。

## 实现

### 1. 后端 workflow / workspace starter 保存前 guard

- 更新 `api/app/services/workflow_tool_execution_validation.py`
- 当 `llm_agent.config.toolPolicy.execution.class` 显式声明 execution target，且 `toolPolicy.allowedToolIds` 未提供、为空或归一化后为空时：
  - 遍历当前 workspace 可见且可调用的 tool catalog；
  - 复用既有 `_build_execution_support_issue()` 判断这些工具是否与当前 execution target 兼容；
  - 只要仍存在 execution-incompatible tool，就阻断 definition 保存。
- 阻断信息会明确指出：当前是“未通过 `allowedToolIds` 收口工具范围”，而不是泛泛地提示某个 tool 不支持某个 class。

### 2. 前端 editor preflight 对齐同一条规则

- 更新 `web/lib/workflow-tool-execution-validation.ts`
- editor 本地保存前校验现在也会在 `toolPolicy.execution` 显式存在、但 `allowedToolIds` 未收口时，提示当前 workspace 里仍有哪些工具与目标 execution class 不兼容。
- 这样作者不必等到 API 422 才理解为什么“显式 microvm/sandbox”仍不安全。

### 3. 回归测试

- 更新 `api/tests/test_workflow_routes.py`
  - 新增 workflow create 场景，验证未收口的 `llm_agent.toolPolicy.execution = microvm` 会被拒绝。
- 更新 `api/tests/test_workspace_starter_routes.py`
  - 新增 workspace starter create 场景，验证模板链路同样会拒绝这类配置。

## 影响范围

### 架构链条

- **安全性增强**：execution policy 不再只在运行时阻断，也开始在 authoring 阶段明确要求“强隔离声明必须绑定到兼容工具集”。
- **可靠性增强**：减少“definition 能保存、AI 运行时才因为挑到 native tool 被 fail-closed”的迟到失败。
- **稳定性增强**：workflow、workspace starter 与 editor preflight 三条链路对 `toolPolicy.execution` 的理解更一致。
- **扩展性增强**：后续 native tool 真正接入 sandbox backend contract 时，可以在现有 guard 基础上从“未收口时阻断”平滑演进到“仅允许兼容工具子集”。

### 对产品闭环的帮助

- 这轮推进的是 **AI 使用层 + AI 治理层** 的主业务闭环，不是样式或局部重构。
- **AI 使用层**：工作流作者为 Agent 打开强隔离目标时，系统现在会要求其同时声明兼容工具范围，减少运行时突然踩到 native/不兼容工具的失败。
- **AI 治理层**：隔离目标从 runtime honesty 进一步推进到 authoring honesty，更接近“安全可靠可信”的完整链路，而不是只靠 operator 在 run failure 后补救。

## 验证

- 定向测试：`api/.venv/Scripts/uv.exe run pytest -q tests/test_workflow_routes.py tests/test_workspace_starter_routes.py`
- 前端静态检查：`web/pnpm exec tsc --noEmit`
- 前端 lint：`web/pnpm lint`

## 未完成与下一步

1. 继续把 compat plugin 已声明的 `sandbox / microvm` 从 host 侧绑定，推进到 adapter / runner 真实隔离兑现。
2. 继续让 native tool 接入统一 sandbox backend contract，而不只是先做 fail-closed + authoring guard。
3. 视编辑器使用反馈，考虑把“execution-compatible tool subset”做成更直接的可视化提示，而不是只在 validation message 中给出。
