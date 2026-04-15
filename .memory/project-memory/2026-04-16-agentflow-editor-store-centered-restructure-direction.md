---
memory_type: project
topic: agentFlow editor 改造方向切换为 Dify 式 store 中心化重构
summary: 用户在 `2026-04-16 07` 明确选择按 Dify 式 store / interaction hooks 中心化方案重构 `agent-flow` editor，允许调整 `editor / nodes / inspector / hooks / document` 边界，并要求参考既有设计稿 `docs/superpowers/specs/1flowse/2026-04-15-agentflow-editor-design.md`。
keywords:
  - agent-flow
  - editor
  - dify
  - store
  - hooks
  - restructure
match_when:
  - 继续讨论或实现 agentFlow editor 重构
  - 需要判断 editor 状态边界、hooks 边界或 store 设计
created_at: 2026-04-16 07
updated_at: 2026-04-16 07
last_verified_at: 2026-04-16 07
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow
  - docs/superpowers/specs/1flowse/2026-04-15-agentflow-editor-design.md
---

# agentFlow editor 改造方向切换为 Dify 式 store 中心化重构

## 时间

`2026-04-16 07`

## 谁在做什么

- 用户要求为 `agent-flow` editor 输出结构级重构方案。
- AI 先给出三种路径后，用户明确选择 `3`，即参考 `Dify` 当前 workflow editor 的 store / interaction hooks 组织方式进行重构。

## 为什么这样做

- 当前 `agent-flow` 已有 editor 壳层、canvas、inspector 和 autosave，但 document mutation 分散在 `shell / canvas / inspector / node-registry`。
- 用户希望不只做最小改造，而是允许重新划清 `editor / nodes / inspector / hooks / document` 边界，向 Dify 更接近的编辑器内核收口。

## 为什么要做

- 为后续补齐 `handle connect`、边中插入、容器子画布、统一连线校验、draft 同步、history 边界提供稳定挂点。
- 避免继续在 UI 组件里堆叠 graph 写操作，导致 editor 行为越来越分散。

## 截止日期

- 未指定

## 决策背后动机

- 仍继承 `2026-04-15-agentflow-editor-design.md` 里关于第一版节点范围、overlay、autosave、issues、container 子画布等产品决策。
- 本轮变化点不在产品范围，而在前端实现架构：从当前 shell-centric 实现，切到 Dify 式 store-centric / hooks-centric editor 内核。
- 后续设计文档与实现计划都应默认围绕 `editor store + interaction hooks + document transforms + UI adapters` 组织，而不是继续围绕页面组件拆逻辑。
