---
memory_type: feedback
feedback_category: interaction
topic: 工具型页面状态行应紧凑透明而非高白卡
summary: 顶部状态行、摘要行和轻量操作区不要默认做成高白色卡片；只承载一行状态文字和按钮时，应透明、低高度、与页面背景融合。
keywords:
  - frontend
  - ui
  - status-bar
  - transparent
  - compact
  - card
match_when:
  - 调整工具型页面顶部状态区或摘要区
  - 设计页面内轻量操作栏、状态栏、API 密钥入口等区域
  - 判断某个 UI 区域是否应该做成卡片
created_at: 2026-05-10 16
updated_at: 2026-05-10 16
last_verified_at: 2026-05-10 16
decision_policy: direct_reference
scope:
  - web/app/src/features
  - .agents/skills/frontend-development/references/visual-baseline.md
---
# 工具型页面状态行应紧凑透明而非高白卡

## 时间

`2026-05-10 16`

## 规则

- 顶部状态行、摘要行和轻量操作区不要默认做成高白色卡片。
- 只需要容纳一行状态文字和一个或几个按钮时，应优先使用透明背景、低高度和页面背景融合。
- 白色卡片应保留给承载成组内容、表单、列表、详情或需要明确边界的内容区。

## 原因

- 工具型控制台页面需要更高信息密度，过高的白色状态卡会制造不必要的视觉重量。
- 一行状态和按钮属于轻量上下文，不应抢占内容卡的层级。
- 透明紧凑的状态行能让用户更快进入主要内容区。

## 适用场景

- 应用 API 页、日志页、监控页、设置页等工具型页面的顶部状态区。
- API Key、发布状态、启用状态、筛选摘要等轻量操作入口。
- 评估某块 UI 是否应该是卡片、工具条、状态行或普通 inline 区域时。
