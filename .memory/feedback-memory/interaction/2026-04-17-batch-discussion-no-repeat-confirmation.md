---
memory_type: feedback
feedback_category: interaction
topic: 设计讨论应集中收口且不重复确认已答复条目
summary: 当用户已经对一组设计条目集中答复后，后续应直接把剩余问题一次性集中发出，不要重复追问已确认内容。
keywords:
  - interaction
  - discussion
  - confirmation
  - batch
match_when:
  - 用户要求把设计问题集中讨论
  - 用户已经一次性回复多条决策
  - AI 准备继续追问先前已经确认的条目
created_at: 2026-04-17 23
updated_at: 2026-04-17 23
last_verified_at: 2026-04-17 23
decision_policy: direct_reference
scope:
  - 对话流程
  - 设计讨论
---

# 设计讨论应集中收口且不重复确认已答复条目

## 时间

`2026-04-17 23`

## 规则

当用户已经对一组设计条目做了集中回复，例如“按推荐”或逐条给出答案，后续不要再重复确认这些已答复条目。若还有剩余问题，应一次性集中列出。

## 原因

重复确认会打断设计推进节奏，增加用户沟通成本，也与用户偏好的“一次性集中讨论”冲突。

## 适用场景

- 架构讨论
- 前端信息架构与组件分层讨论
- spec / plan 前的决策收口

## 备注

若剩余问题很少，也应直接给默认建议，并明确哪些内容会按默认值推进，而不是再拆成多轮确认。
