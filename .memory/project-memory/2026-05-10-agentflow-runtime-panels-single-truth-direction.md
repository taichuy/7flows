---
memory_type: project
topic: Agent Flow 变量缓存与节点上次运行必须共享同一运行态真值
summary: 用户在 2026-05-10 明确要求 Agent Flow 底部变量缓存与右侧节点上次运行虽然可以走不同接口，但数据来源必须统一到同一 run scope，不接受一个读 session cache、一个读 latest node run 的分叉语义。
keywords:
  - agentflow
  - runtime
  - variable-cache
  - node-last-run
  - single-source-of-truth
  - run-scope
match_when:
  - 需要继续修复 Agent Flow 变量缓存与节点运行态不一致
  - 需要设计或评估变量缓存、上次运行、run detail、snapshot 的真值边界
  - 需要决定前端面板是否允许读取不同 run scope
created_at: 2026-05-10 22
updated_at: 2026-05-10 22
last_verified_at: 2026-05-10 22
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow
  - api/apps/api-server/src/routes/applications/application_runtime.rs
  - docs/superpowers/specs/1flowbase/2026-05-07-agent-flow-variable-linker-runtime-contract-design.md
---

# Agent Flow 变量缓存与节点上次运行必须共享同一运行态真值

## 时间

`2026-05-10 22`

## 谁在做什么

用户要求收敛 Agent Flow 运行态展示边界；AI 负责后续把变量缓存与节点上次运行的取数语义统一到同一 run scope。

## 为什么这样做

当前界面存在结构性分叉：一个面板可以读当前 editor session cache / snapshot，另一个面板读 latest node run。即使字段名相同，也可能来自不同 run，用户无法判断哪边才是当前真值。

## 为什么要做

运行态调试的核心不是“两个面板都能显示数据”，而是“同一轮运行在不同面板下展示一致”。否则用户会把缓存、last run、snapshot、preview 误认为同一事实源，破坏可解释性。

## 截止日期

未单独约定；命中 Agent Flow runtime 一致性修复时优先遵守。

## 决策背后动机

允许接口拆分，但不允许真值分叉。后续设计应以同一个 `run_id / node_run_id / debug_session_scope` 为统一锚点；snapshot 只做恢复或加速，不得和 latest node run 并列充当另一套事实源。
