---
title: Dify 对话调试工具参考方向
created_at: 2026-04-25 00
memory_type: project-memory
decision_policy: verify_before_decision
status: active
keywords:
  - dify
  - chat
  - debug-and-preview
  - agent-flow
  - tracing-panel
---

## 谁在做什么？

用户已完成一轮 Dify 风格变量编辑体验对齐，并提交 `04cd9aab fix: align variable editor interactions with Dify`。随后用户指出 Dify 的对话工具很实用，希望继续查看本地 `/home/taichu/git/dify` 中的对话、调试和运行过程组件，评估哪些能力可以迁移或超越到 1flowbase 的 agent-flow。

## 为什么这样做？

Dify 的 Workflow 调试面板把「输入变量」「对话发送」「运行态」「工作流过程」「节点追踪」「人工输入」「会话变量」组合在同一个可操作调试入口中，对编排产品的试运行体验有直接参考价值。

## 为什么要做？

1flowbase 当前 agent-flow 已有节点详情、Last Run、节点运行按钮和运行 API，但还缺少一个面向整条流程的「对话式调试 / Preview」主入口。参考 Dify 可以更快补齐从单节点运行到整流试跑、追踪、复用输入的体验闭环。

## 截止日期？

暂无明确截止日期；当前属于 2026-04-25 的产品分析与后续实现候选方向。

## 决策背后动机？

目标不是照搬 Dify，而是吸收其高价值交互：一次性输入、运行过程可见、节点追踪可钻取、响应可操作、上下文可复用，并按 1flowbase 的视觉规范和 agent-flow 架构做更一致、更工程化的实现。

## 2026-04-25 决策补充

1. 用户已确认方向：`agent-flow` 需要独立的 `Agent Flow Debug Console`，作为整条流程的调试入口，而不是继续把能力塞进节点 `Inspector`。
2. `Debug Console` 与 `Node Last Run` 的分工已收敛：
   - `Debug Console` 负责整流输入、消息结果、trace、变量与整流级操作。
   - `Node Last Run` 继续负责单节点最近一次运行的检查。
3. 当前实现计划被拆成两阶段：
   - 第一阶段：基于现有 `start_flow_debug_run` detail 合同，先做快照式 `Debug Console Foundation`。
   - 第二阶段：后端补齐异步整流、真实 `cancel / stop` 与 live trace，再升级为 `Live Runtime`。
4. 第一阶段明确不做假的 `stop`。仅靠前端 `AbortController` 只能中断请求，不能停止后端 flow run，不能算交付能力。
