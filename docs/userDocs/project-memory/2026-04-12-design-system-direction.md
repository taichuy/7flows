---
memory_type: project
topic: DESIGN 规范重写方向
summary: 当前 DESIGN.md 需要参考草稿结构重写为深色控制台加轻翡翠绿强调色，并保留工作区边界与 Editor UI 子规范。
keywords:
  - design-system
  - DESIGN.md
  - editor-ui
  - web
match_when:
  - 需要重写或评估 DESIGN.md
  - 需要判断前端设计规范方向
created_at: 2026-04-12 17
updated_at: 2026-04-12 17
last_verified_at: 2026-04-12 17
decision_policy: verify_before_decision
scope:
  - DESIGN.md
  - docs/userDocs/draft/DESIGN.md
  - web
---

# DESIGN 规范重写方向

## 时间

`2026-04-12 17`

## 谁在做什么

- 用户要求重写 `DESIGN.md`，参考 `docs/userDocs/draft/DESIGN.md` 的结构与写法。
- AI 负责将当前规范重组为更统一的 UI 执行规范，并保留 1Flowse 自身的画布与工作区规则。

## 为什么这样做

- 原 `DESIGN.md` 的规则有效，但章节结构与参考稿风格差异较大，阅读上有明显拼接感。
- 用户希望视觉方向切到更接近深色工程控制台和轻翡翠绿强调色，同时不丢失项目自身的产品语法。

## 为什么要做

- 让设计规范更像一份可直接指导 AI 和工程实现的 design system，而不是浅色规范与参考稿混杂的过渡版本。
- 统一后续前端实现口径，减少把 Shell、Editor、状态语义和工作区边界写散的风险。

## 截止日期

- 未指定

## 决策背后动机

- `DESIGN.md` 继续保留为单文档，不拆分独立工作区规则文档。
- 文档整体结构参考 `docs/userDocs/draft/DESIGN.md`，但不照搬品牌叙事。
- 视觉方向切换为深色控制台 + 更亮、更通电的轻翡翠绿强调色。
- `Editor UI Layer 子规范` 与 `工作区边界与交互规则` 必须保留，原意保留、文字重写。
- 画布外 UI 默认以 `Ant Design` 为基线；画布内基于 `xyflow`，通过 `Editor UI` 自封装组件和样式调整落地。
- 状态色唯一语义映射继续作为硬约束保留。
- 前端相关依赖与实现边界检查前，先确认 monorepo 实际目录结构；本项目的前端工作区位于 `web/`，依赖核对与实现参考应优先从 `web/app`、`web/packages/ui` 及相关 workspace 包开始。

## 关联文档

- `DESIGN.md`
- `docs/userDocs/draft/DESIGN.md`
- `docs/superpowers/specs/1flowse/2026-04-10-p1-architecture.md`
