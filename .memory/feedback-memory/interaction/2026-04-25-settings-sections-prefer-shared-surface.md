---
memory_type: feedback
feedback_category: interaction
topic: 设置页整组 section 优先抽共享壳层，不做逐页补边距
summary: 用户明确要求 settings 下多 section 的视觉一致性优先通过抽取 docs 的公共 section 壳层实现，不接受仅在单页补 padding 掩盖布局差异。
keywords:
  - settings
  - shared surface
  - docs style
  - ui consistency
  - section wrapper
match_when:
  - 设置页多个 section 之间出现起始高度或头部样式不一致
  - 已有某个 section 样式被用户认可，希望推广到整组页面
  - 讨论是否用局部 padding 修补视觉问题
created_at: 2026-04-25 19
updated_at: 2026-04-25 19
last_verified_at: 2026-04-25 19
decision_policy: direct_reference
scope:
  - web/app/src/features/settings
  - .memory/feedback-memory/interaction
---

# 设置页整组 section 优先抽共享壳层，不做逐页补边距

## 时间

`2026-04-25 19`

## 规则

- settings 下多个 section 的视觉一致性，优先通过抽取公共 section 壳层解决。
- 当某个 section 的头部和起始样式已经被用户认可时，优先把它上提成共享 wrapper，再让各页内容挂进去。
- 不用逐个 panel 自己补顶部 padding 或独立 header 去“遮住”共享布局问题。

## 原因

- 局部补边距只能修单页，后续其它 section 还会继续分叉。
- 共享壳层能统一标题层级、起始高度、说明区和工具栏位置，后续维护成本更低。

## 适用场景

- `/settings/*` 这种同一导航壳下的多 section 页面
- 某个页面样式已经被确认是“好的基准”，需要推广到同组页面
- 需要在不改导航壳结构的前提下统一 section 头部与内容起点
