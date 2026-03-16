# 2026-03-17 Execution Diagnostics Summary

## 背景

- `runtime-foundation` 把 graded execution / sandbox isolation 继续列为 `P0`，但当前真实隔离 backend 还未完整落地。
- 最近主链已经补齐 execution-aware dispatch、unsupported execution class fail-closed，以及相关 trace 事件；不过 operator 仍需要翻 `run_events` 才能看清一次 run 到底请求了什么执行级别、是否发生 fallback、是否因为缺少 sandbox backend 被阻断。
- 这会影响你最近最关注的“沙箱隔离进展如何”判断：事实已经比文档里更进一步，但观测面还不够直接。

## 目标

- 把 execution-related trace 收口成 run diagnostics 的结构化摘要。
- 让 operator 在 execution overview / node card 直接看到 requested/effective execution class、executor ref、fallback / blocked / unavailable 次数与原因。
- 在不引入第二套执行语义的前提下，增强当前架构对隔离能力推进的可观测性和可追溯性。

## 实现

- 后端为 `RunExecutionSummary` 新增 execution 诊断聚合字段：
  - `execution_dispatched_node_count`
  - `execution_fallback_node_count`
  - `execution_blocked_node_count`
  - `execution_unavailable_node_count`
  - `execution_requested_class_counts`
  - `execution_effective_class_counts`
  - `execution_executor_ref_counts`
- 后端为 `RunExecutionNodeItem` 新增 node 级 execution 诊断字段：
  - `effective_execution_class`
  - `execution_executor_ref`
  - `execution_blocking_reason`
  - `execution_fallback_reason`
  - `execution_dispatched_count / fallback_count / blocked_count / unavailable_count`
- `api/app/services/run_execution_views.py` 新增 execution signal 聚合逻辑，统一消费：
  - `node.execution.dispatched`
  - `node.execution.fallback`
  - `node.execution.unavailable`
  - `tool.execution.dispatched`
  - `tool.execution.fallback`
  - `tool.execution.blocked`
- 前端 `run diagnostics` 执行总览新增 execution summary cards 和 requested/effective/executor metric rows。
- 前端 execution node card 新增 effective class、executor、fallback/blocking reason 与 signal counts 的可视化。

## 影响范围

- 后端 execution view API 结构扩展：`api/app/schemas/run_views.py`
- 后端 run execution 聚合逻辑：`api/app/services/run_execution_views.py`
- 前端 execution diagnostics 展示：
  - `web/lib/get-run-views.ts`
  - `web/components/run-diagnostics-execution/execution-overview.tsx`
  - `web/components/run-diagnostics-execution/execution-node-card.tsx`

## 验证

- 后端定向测试：`api/.venv/Scripts/uv.exe run pytest -q tests/test_run_routes.py -q`
  - 结果：通过
- 前端类型检查：`web/pnpm exec tsc --noEmit`
  - 结果：通过
- 前端 lint：`web/pnpm lint`
  - 结果：通过（仅 Next.js deprecation 提示，无 lint error）

## 对主业务推进的意义

- 这次不是停留在“代码风格修修补补”，而是把 `P0` 的 sandbox / graded execution 主线向前推进了一步：
  - 之前：execution honesty 主要存在于原始 trace，operator 要靠事件细读才能判断隔离是否兑现。
  - 之后：run diagnostics 直接回答“请求了什么、实际落到了什么、由谁执行、为什么 fallback/blocked”。
- 这直接增强了：
  - 扩展性：后续挂真实 `sandbox` / `microvm` backend 时，现有 UI/API 不需要重做解释层。
  - 兼容性：tool / node 两条 execution 事件主链被统一到同一摘要模型。
  - 可靠性与稳定性：operator 更快发现“策略声明”和“真实执行体”之间的偏差。
  - 安全性：fail-closed 阻断不再只存在于低层事件，而能在 run 诊断首屏被看见。

## 未完成与下一步

1. 把真实 `sandbox` / `microvm` backend registration / execution contract 落到独立层，而不是继续停在 host-subprocess MVP。
2. 把 system overview 也接上 execution readiness / backend health 摘要，形成 run 级 + 系统级双视角。
3. 继续把 AI 自动创建编排主线从 starter / editor / validation 推到真正的“自然语言到 workflow draft”入口；这条线当前仍未形成完整闭环。
