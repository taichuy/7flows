---
memory_type: project
topic: 设置区 API 文档分类选择器改造进入实施计划阶段
summary: 用户已审阅并确认 `/settings/docs` 选择器重构 spec，当前进入实现计划阶段，计划范围固定为检索辅助纯函数、ApiDocsPanel 选择器卡片替换和前端验证。
keywords:
  - settings
  - api docs
  - select
  - plan
  - frontend
match_when:
  - 需要继续执行 `/settings/docs` 分类选择器改造
  - 需要判断是否已经完成 spec 审阅并进入实施
  - 需要确认本轮实现边界
created_at: 2026-04-14 21
updated_at: 2026-04-14 21
last_verified_at: 2026-04-14 21
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-14-settings-docs-category-select.md
  - web/app/src/features/settings/components/ApiDocsPanel.tsx
  - web/app/src/features/settings/components/api-docs-panel.css
  - web/app/src/features/settings/lib/api-docs-category-search.ts
  - web/app/src/features/settings/_tests/api-docs-panel.test.tsx
---

# 设置区 API 文档分类选择器改造进入实施计划阶段

## 时间

`2026-04-14 21`

## 谁在做什么

用户已确认 `/settings/docs` 选择器重构设计稿，当前开始整理实现计划，准备按测试先行的方式落地检索 helper 和选择器卡片。

## 为什么这样做

这轮改动边界很小，但交互细节已明确，先冻结计划可以避免实现时又把简单 UI 需求扩写成接口改造或共享组件抽象。

## 为什么要做

当前实现仍是多卡片墙，而测试和用户确认的方向都已经固定为“顶部单个可检索 Select”。需要尽快把实现、测试和设计重新对齐。

## 截止日期

无单独外部截止日期；应在当前任务链中完成实现与验证。

## 决策背后动机

实施计划固定只覆盖三类内容：

- 检索归一化纯函数
- `ApiDocsPanel` 的选择器卡片与样式
- `web/app` 侧相关单测与验证命令
