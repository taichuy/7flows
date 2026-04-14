---
memory_type: feedback
feedback_category: interaction
topic: 用户明确给出布局比例时按明确比例实现
summary: 当前端讨论里用户已经明确说出布局比例（如 2:8）时，不要自行改写成更对称或更常规的理解；要按该比例实现，或先用同样的比例复述确认。
keywords:
  - frontend
  - layout
  - ratio
  - clarification
match_when:
  - 用户直接给出 UI 布局比例
  - 需要从截图或文字反馈里提炼布局目标
  - 容易把“当前问题描述”误听成“目标设计”
created_at: 2026-04-14 20
updated_at: 2026-04-14 20
last_verified_at: 2026-04-14 20
decision_policy: direct_reference
scope:
  - web
  - frontend discussion
  - layout clarification
---

# 用户明确给出布局比例时按明确比例实现

## 时间

`2026-04-14 20`

## 规则

当前端讨论里用户已经明确给出布局比例时，优先按该比例实现，不要自行改写成更“工整”或更常规的布局理解。

## 原因

布局比例本身就是用户验收标准的一部分；如果把明确的 `2:8` 擅自改成 `1:1`，即使页面更整齐，也会偏离用户真实目标。

## 适用场景

- 用户直接说“左 2 右 8”“三七开”“右侧更宽”之类比例要求
- 根据截图或视觉反馈修正页面分栏
- 需要把“当前现状描述”和“目标比例”重新对齐的时候
