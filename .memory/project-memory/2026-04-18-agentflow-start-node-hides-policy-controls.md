---
memory_type: project
topic: agentFlow 开始节点不暴露失败重试与异常处理
summary: 用户在 `2026-04-18 00` 明确确认 `start` 节点只是入参声明，不参与可失败执行链；node detail 中不应显示“失败重试”和“异常处理”策略区，其它执行型节点保持原策略能力。
keywords:
  - agentflow
  - start-node
  - node-detail
  - policy
  - retry
  - error-handling
match_when:
  - 需要继续调整 agentFlow 开始节点的 node detail
  - 需要判断 `start` 节点是否应支持失败重试或异常处理
  - 需要回看 node detail 策略区对不同节点类型的暴露边界
created_at: 2026-04-18 00
updated_at: 2026-04-18 00
last_verified_at: 2026-04-18 00
decision_policy: verify_before_decision
scope:
  - web/app/src/features/agent-flow/schema/node-schema-fragments.ts
  - web/app/src/features/agent-flow/_tests/node-detail-panel.test.tsx
  - web/app/src/features/agent-flow/lib/node-definitions/nodes/start.ts
---

# agentFlow 开始节点不暴露失败重试与异常处理

## 时间

`2026-04-18 00`

## 谁在做什么

- 用户拍板 `start` 节点的产品语义边界。
- AI 负责把该边界收口到 node detail schema 和回归测试里。

## 为什么这样做

- `start` 节点只承担工作流入参声明与透传，不执行外部调用、模型推理或工具动作。
- 继续暴露“失败重试 / 异常处理”会让节点语义和界面语义冲突，增加误导。

## 为什么现在要做

- 当前 node detail 的通用 schema 仍无条件给 `start` 节点渲染策略区，和用户确认的交互直觉不一致。

## 截止日期

- 无独立截止日期；从 `2026-04-18 00` 起作为 agentFlow node detail 的有效产品规则。

## 决策动机

- 固定“参数声明节点”和“可失败执行节点”的边界，避免后续节点 schema 重构时再次把通用策略误挂到 `start` 节点。
