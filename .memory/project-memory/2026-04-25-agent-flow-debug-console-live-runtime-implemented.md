---
title: Agent Flow Debug Console 第二阶段已落地
created_at: 2026-04-25 21
memory_type: project-memory
decision_policy: verify_before_decision
status: active
keywords:
  - agent-flow
  - debug-console
  - live-runtime
  - cancel
  - polling
---

## 谁在做什么？

当前这轮开发已经把 `Agent Flow Debug Console` 的第二阶段做完：后端把整流调试改成“先创建 run 再后台推进”，前端补了 live polling、真实 `停止运行`、取消态展示和整流级状态机。

## 为什么这样做？

第一阶段只能消费同步 detail 快照，无法提供真正的 stop / live trace。用户明确要求把整个计划一次性执行到底，并且在执行中持续更新计划状态。

## 为什么要做？

没有异步 run 和 cancel，`Debug Console` 只是查看器，不是可操作的调试工作台。当前实现完成后，`agent-flow` 已具备整流输入、启动、轮询、停止、trace 联动和节点 `Last Run` 刷新的完整闭环。

## 截止日期？

本轮实现与验证完成于 2026-04-25 21。

## 决策背后动机？

1. 后端没有新增 migration，因为 `FlowRunStatus::Cancelled` 和既有状态流转规则本来就存在，直接复用 `flow_runs.status / finished_at` 更小、更稳。
2. `start_flow_debug_run` 改成立即返回 `running`，后台再调用 `continue_flow_debug_run` 推进节点执行，避免把异步控制塞进 HTTP handler。
3. `cancel` 通过独立 route 和 service command 落库，前端不再用“中断请求”假装停止运行。
4. 前端 hook 统一管理 `runId`、轮询定时器、消息替换和取消，避免把 live runtime 逻辑散落到面板组件里。
