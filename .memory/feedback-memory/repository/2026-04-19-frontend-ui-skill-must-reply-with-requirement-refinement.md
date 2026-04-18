---
memory_type: feedback
feedback_category: repository
topic: frontend-development skill 对 UI 开发需求必须先输出含交互设计的需求整理
summary: 用户要求 `frontend-development` skill 不仅在模糊需求场景下思考需求，而且在页面 / UI 开发需求中应把需求整理、需求细化、页面交互设计和明确建议作为显式回复内容先发给用户，再默认继续实现；同时 `Quick Reference` 和 `Common Mistakes` 需要避免重复和口径冲突。
keywords:
  - frontend
  - skill
  - ui requirement
  - requirement refinement
  - customer-facing reply
  - interaction design
  - quick reference
match_when:
  - 更新 `frontend-development` skill
  - 设计页面 / UI 开发类 skill 的触发条件和默认回复
  - 判断 UI 开发需求是否必须先输出需求整理
created_at: 2026-04-19 00
updated_at: 2026-04-19 07
last_verified_at: 2026-04-19 07
decision_policy: direct_reference
scope:
  - .agents/skills/frontend-development
  - .memory/feedback-memory/repository
---

# frontend-development skill 对 UI 开发需求必须先输出含交互设计的需求整理

## 时间

`2026-04-19 07`

## 规则

- `frontend-development` skill 命中页面 / UI 开发需求时，回复里必须先显式输出需求整理、需求细化、页面交互设计和明确建议。
- 这份需求整理是发给用户 / 客户看的必要内容，不是只在内部完成。
- 新页面、页面改版、布局调整、模块级 UI 开发、图片 / 外部样本驱动时，应使用完整需求草案。
- 明确范围的页面 / 模块 UI 开发，至少也要给简版需求整理。
- 需求整理不能只停留在页面结构和模块列表，必须先整理主路径、关键反馈和模块协作，再开始实现。
- 只有纯局部样式修补、像素级对齐、文案替换或不改变页面结构的 UI bugfix，才可以跳过完整需求整理。
- `Quick Reference` 和 `Common Mistakes` 应保持高信息密度，避免重复表达同一条规则或互相打架。

## 原因

- 如果只在脑内做需求收敛，用户看不到 AI 的任务理解和边界判断，容易误以为 AI 直接按自己的想象写页面。
- 触发条件只写“模糊需求”太窄，会漏掉很多其实也应该先整理需求的 UI 开发请求。
- 把需求整理作为显式回复，可以更早暴露方向偏差，同时不牺牲默认继续实现的速度。
- 如果需求整理不包含页面交互，agent 很容易退化成“把几个卡片堆上去”，没有真正设计用户如何完成任务。
- `Quick Reference` 和 `Common Mistakes` 如果重复堆叠，会降低 skill 的可扫描性，也更容易让后续 agent 误判优先级。

## 适用场景

- 调整 `frontend-development` skill 的 metadata、默认动作或模板
- 处理页面开发、页面改版、模块级 UI 开发需求
- 判断 AI 是否应该先向用户输出需求细化和交互设计再开始实现
- 精简 skill 的 `Quick Reference` 或 `Common Mistakes`
