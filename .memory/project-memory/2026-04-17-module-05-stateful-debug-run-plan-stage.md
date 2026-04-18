---
memory_type: project
topic: 模块 05 第二份实现计划已固定为 stateful debug run 与 resume
project_memory_state: in_progress
summary: 用户于 `2026-04-17 21` 明确要求开始写第二份计划；当前已新增 `docs/superpowers/plans/2026-04-17-module-05-stateful-debug-run-and-resume.md`，范围固定为 `whole-flow debug run -> waiting_human / waiting_callback checkpoint -> resume`，并明确不把真实外部副作用执行与监控聚合并入本轮。
execution_gap:
  - second plan 已写成正式 implementation plan
  - callback / waiting_human / resume 与 whole-flow debug run 尚未落代码
  - 真实 LLM / Tool / HTTP 执行继续后置
  - monitoring 聚合与 tracing 配置继续后置
keywords:
  - module-05
  - runtime-orchestration
  - stateful-debug-run
  - waiting-human
  - waiting-callback
  - resume
  - plan-stage
match_when:
  - 需要继续执行模块 05 第二份计划
  - 需要确认 callback / waiting_human / resume 属于哪一轮
  - 需要判断真实外部副作用与 monitoring 是否已并入第二份计划
created_at: 2026-04-17 21
updated_at: 2026-04-17 21
last_verified_at: 2026-04-17 21
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-17-module-05-stateful-debug-run-and-resume.md
  - docs/superpowers/specs/1flowbase/modules/05-runtime-orchestration/README.md
  - docs/superpowers/specs/1flowbase/2026-04-10-orchestration-design-draft.md
  - api/crates/orchestration-runtime
  - api/crates/control-plane/src/orchestration_runtime.rs
  - api/apps/api-server/src/routes/application_runtime.rs
  - web/app/src/features/agent-flow
  - web/app/src/features/applications
---

# 模块 05 第二份实现计划已固定为 stateful debug run 与 resume

## 时间

`2026-04-17 21`

## 谁在做什么

- 用户已经确认继续写 `05` 的第二份 implementation plan，而不是切到 `06B`。
- AI 已将第二份计划写入 `docs/superpowers/plans/2026-04-17-module-05-stateful-debug-run-and-resume.md`。

## 为什么这样做

- 第一份计划只完成了 `single-node debug preview + logs / node last run` 的最小闭环，无法承接 `waiting_human / waiting_callback / resume`。
- 如果这轮再把真实外部副作用执行和 monitoring 聚合一起并入，会重新变成跨多个子系统的大计划，执行风险过高。

## 为什么要做

- `06B 发布网关` 之前，必须先把 `05` 做到“整流能跑、等待能停、输入能续、状态能查”。
- 只有 stateful debug run 成立，后续真实 `LLM / Tool / HTTP` 执行和 monitoring 聚合才有稳定运行对象与事件真相来源。

## 截止日期

- 无硬截止日期；当前目标是让第二份计划成为后续实现的唯一执行入口。

## 决策背后动机

- 本轮计划范围固定为：
  - whole-flow debug run
  - `waiting_human`
  - `waiting_callback`
  - checkpoint / callback task
  - resume
- 本轮明确不纳入：
  - 真实 `LLM / Tool / HTTP` 外部副作用执行
  - monitoring 聚合图表
  - tracing 配置 UI
  - 发布网关与公开 callback webhook
- 模块推进顺序继续保持：
  - `05 phase 2` 先完成 stateful debug run
  - 再继续 `05` 的真实副作用执行与 monitoring
  - 最后再进入 `06B`
