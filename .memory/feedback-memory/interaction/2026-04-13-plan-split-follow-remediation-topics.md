---
memory_type: feedback
feedback_category: interaction
topic: 拆 remediation plan 时优先按已确认 spec 专题边界，而不是按既有模块上下文二次拆分
summary: 当用户要求把已确认的整改 spec 拆成多个 plan 时，如果 spec 自己已经定义了专题和执行顺序，应直接按专题拆分，不要因为当前正在实现或已实现某个模块就改按模块拆。
keywords:
  - plan
  - split
  - remediation
  - spec
  - topic
match_when:
  - 用户要求把一份已确认设计稿拆成多个落地 plan
  - 设计稿自身已经给出专题划分或执行顺序
  - 对话里同时出现“已有模块背景”和“当前整改计划”两个层级
created_at: 2026-04-13 14
updated_at: 2026-04-13 14
last_verified_at: 2026-04-13 14
decision_policy: direct_reference
scope:
  - docs/superpowers/specs
  - docs/superpowers/plans
  - user interaction
---

# 拆 remediation plan 时优先按已确认 spec 专题边界，而不是按既有模块上下文二次拆分

## 时间

`2026-04-13 14`

## 规则

当用户要求把一份已经确认通过的整改 spec 拆成多个落地 plan，而该 spec 已经明确列出专题或执行顺序时，plan 应直接按这些专题拆分。

## 原因

既有模块目录可能只是历史实现背景，并不是当前整改的工作分解依据。如果把整改 plan 错拆成按模块拆，会导致：

- 实际整改目标和 plan 边界错位；
- 已实现模块被误当成当前拆分主线；
- 后续执行和验收时又要重新做 spec 到 plan 的人工映射。

## 适用场景

- QA remediation spec
- refactor spec
- migration spec
- 任何“总设计稿已经先给出 A/B/C/D 专题”的拆 plan 场景
