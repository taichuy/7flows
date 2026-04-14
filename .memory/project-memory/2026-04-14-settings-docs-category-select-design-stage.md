---
memory_type: project
topic: 设置区 API 文档分类入口已确认改为可检索的 Ant Select
summary: 用户已确认 `/settings/docs` 不再遍历分类卡片，而是改成顶部单个选择器卡片，使用 Ant Design Select，支持按 `label + id` 检索并忽略常见分隔符。
keywords:
  - settings
  - api docs
  - category
  - select
  - search
match_when:
  - 需要继续实现或回归 `/settings/docs`
  - 需要判断分类入口应该是卡片墙还是下拉选择
  - 需要确认检索规则是否包含 `id`
created_at: 2026-04-14 21
updated_at: 2026-04-14 21
last_verified_at: 2026-04-14 21
decision_policy: verify_before_decision
scope:
  - web/app/src/features/settings/components/ApiDocsPanel.tsx
  - web/app/src/features/settings/components/api-docs-panel.css
  - web/app/src/features/settings/_tests/api-docs-panel.test.tsx
  - docs/superpowers/specs/1flowse/2026-04-14-settings-docs-category-select-design.md
---

# 设置区 API 文档分类入口已确认改为可检索的 Ant Select

## 时间

`2026-04-14 21`

## 谁在做什么

用户要求把 `/settings/docs` 里基于 `/api/console/docs/catalog` 的分类展示，从遍历卡片改成带检索的 `Ant Design Select`。

## 为什么这样做

当前卡片墙对后台管理页来说占位过大，也削弱了“当前正在查看哪个分类”的主任务焦点。用户明确认为这种展示“不好看”，希望改成更紧凑、更工具化的选择器。

## 为什么现在做

相关测试已经先收敛到“顶部单个选择器卡片”的方向，当前实现与测试预期不一致，继续放着会让后续前端改动和回归判断都失真。

## 截止时间

无单独外部截止时间；应在当前任务链内完成设计、实现、验证与提交。

## 决策动机

已确认的交互决策如下：

- 分类入口改为顶部单个选择器卡片
- 组件使用 `Ant Design Select`
- 下拉项展示 `label` 主标题、`id` 副标题和接口数
- 检索范围包含 `label + id`
- 检索时忽略大小写和 `- / : _` 等常见分隔符
- 继续使用 `?category=` 作为 URL 真值层
