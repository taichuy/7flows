# 2026-03-16 Run Diagnostics Callback Waiting Summary

## 背景

- 用户要求先复核仓库现状、最近一次 Git 提交的衔接关系、基础框架是否足以继续推进主业务，并在此基础上按优先级继续开发与补文档。
- 最近几次提交连续围绕 `WAITING_CALLBACK` durable resume 主链推进：`ba0b0e5`、`d960378`、`123b28e`、`c88dd5a` 到 `d352c76 feat: cap waiting callback expiry cycles`，已经补齐 callback ticket cleanup、after-commit resume、lifecycle summary 与 max expired cycles termination。
- 复核后发现：callback 主链的后端事实已经越来越完整，但 run diagnostics 仍然缺少 run 级 callback waiting 聚合视图；前端 `web/components/run-diagnostics-execution-sections.tsx` 也已经膨胀到 500+ 行，继续承载 callback 诊断会明显拉低可维护性。

## 目标

- 衔接最近的 callback lifecycle / expiry 提交链，把 `WAITING_CALLBACK` 的聚合可观测性补到 run diagnostics 主视图。
- 在不引入第二套事实层的前提下，继续坚持 `runs / node_runs / run_events / callback tickets` 为唯一事实来源。
- 顺手拆掉 run diagnostics 的前端长组件，避免 callback 诊断增强继续堆回单体 JSX。

## 实现

### 1. 后端 execution view 新增 run 级 callback waiting 聚合摘要

- 在 `api/app/schemas/run_views.py` 新增 `RunCallbackWaitingSummary`，并把它挂到 `RunExecutionSummary.callback_waiting`。
- 在 `api/app/services/run_views.py` 新增 `serialize_run_callback_waiting_summary()`：
  - 复用已有的 node 级 `serialize_callback_waiting_lifecycle_summary()`。
  - 按 run 聚合 callback waiting 节点数、terminated 节点数、issued / expired / consumed / canceled ticket 总量。
  - 额外聚合 `last_resume_source` 与 `termination_reason` 的分布，方便 operator 直接判断“主要由谁在触发 resume”“终止集中落在哪类原因”。
- `RunViewService.get_execution_view()` 现在会把该摘要直接返回给前端，不需要前端遍历每个 node payload 再做二次计算。

### 2. 前端拆分 run diagnostics execution/evidence 单体组件

- 保留原入口 `web/components/run-diagnostics-execution-sections.tsx`，但将其收口为轻量壳层。
- 新增 `web/components/run-diagnostics-execution/` 下的拆分组件：
  - `execution-overview.tsx`
  - `evidence-overview.tsx`
  - `execution-node-card.tsx`
  - `evidence-node-card.tsx`
  - `shared.tsx`
- `execution-overview.tsx` 直接展示 run 级 callback waiting summary，包括：
  - callback wait 节点数
  - expired ticket 总量
  - resume schedule 总量
  - late callback 总量
  - terminated wait 节点数
  - resume source / termination reason 分布
- `execution-node-card.tsx` 继续保留 node 级 execution policy、tool/AI/callback ticket/artifact 明细，并补充 lifecycle 的最近 ticket 状态、resume source 与 late status，便于从“run 级聚合”钻到“节点级事实”。

### 3. 契约补测

- 在 `api/tests/test_run_view_routes.py` 为 execution view 新增 `summary.callback_waiting` 断言，锁定新的 API contract。

## 影响范围

- `api/app/schemas/run_views.py`
- `api/app/services/run_views.py`
- `api/tests/test_run_view_routes.py`
- `web/lib/get-run-views.ts`
- `web/components/run-diagnostics-execution-sections.tsx`
- `web/components/run-diagnostics-execution/*`

## 验证

- `api/.venv/Scripts/uv.exe run pytest -q tests/test_run_view_routes.py`
- `api/.venv/Scripts/uv.exe run pytest -q`
- `web/pnpm lint`
- `web/pnpm exec tsc --noEmit`

结果：

- 后端 targeted route test 通过。
- 后端全量 `252 passed`。
- 前端 lint 通过。
- 前端 TypeScript 检查通过。

## 结论与衔接判断

- 最近一次提交 `d352c76 feat: cap waiting callback expiry cycles` 不需要返工式衔接，但需要继续补“可观测性和 operator 落点”。
- 本轮已完成其中最直接的一步：把 callback waiting 的 run 级聚合事实接到 execution view，并把 run diagnostics 前端拆成可持续扩展的结构。
- 当前基础框架仍满足继续推进主业务、插件扩展、兼容演进、可靠性与安全性建设；项目还没有进入“只剩人工逐项界面设计/验收”的阶段，因此本轮不触发通知脚本。

## 下一步

1. 优先把 `WAITING_CALLBACK` 继续接到 published callback drilldown 与 operator 入口。
2. 补通知 worker / inbox，把 callback / sensitive access 的 waiting 态从“有事实”推进到“有统一收件入口”。
3. 继续把 `execution-node-card.tsx` 按 tool / ai / ticket / artifact drilldown 拆细，避免新一轮 callback/publish 诊断功能再次堆回单体组件。
