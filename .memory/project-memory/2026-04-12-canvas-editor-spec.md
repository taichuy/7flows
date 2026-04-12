---
memory_type: project
topic: 无限画布 Editor 规范补充方向
summary: 需要补强无限画布的组件级规范，重点覆盖 Surface、Controls、Node Anatomy、选中态与运行态语义分离。
keywords:
  - canvas
  - editor
  - node
  - selected
  - controls
match_when:
  - 需要设计或实现无限画布编排界面
  - 需要确认节点状态与交互层次
created_at: 2026-04-12 18
updated_at: 2026-04-12 18
last_verified_at: 2026-04-12 18
decision_policy: verify_before_decision
scope:
  - DESIGN.md
  - web
  - ../dify
---

# 无限画布 Editor 规范补充方向

## 时间

`2026-04-12 18`

## 谁在做什么

- 用户要求补强 `DESIGN.md` 中无限画布相关规范，重点补 `Canvas Surface`、`Canvas Controls`、`Node Anatomy`、节点状态与布局规则。
- AI 负责参考 `../dify` 的工作流画布交互分层，整理为可直接指导实现的组件级规范。

## 为什么这样做

- 现有 `DESIGN.md` 已有主题、状态色、Shell 组件和基础 `NodeCard` 规则，但无限画布层仍缺少可直接落地的操作条、节点骨架、选区和浮层入口规范。
- 用户明确认为 `selected` 的浅蓝色方案可以保留交互逻辑，但应切回当前主题体系，不再沿用浅蓝视觉。

## 为什么要做

- 防止后续编排页在按钮布局、节点结构、连线反馈和浮层入口上反复重新设计。
- 保证 Shell 与 Editor 继续是一套产品语言，而不是参考外部产品后长成第二套视觉系统。

## 截止日期

- 未指定

## 决策背后动机

- 本轮按“组件级”补文档，而不是只写原则级说明；要求文档能直接指导实现，但不写死到逐像素复刻外部产品。
- 参考 `../dify` 的交互层次：左下主操作条、缩放条、节点头部状态、edge 插入与浮层菜单，但不直接照搬其浅蓝选中态。
- `selected` 统一改为冷青色 `#2bb9b1`，与主强调绿和运行态拉开语义层次。
- 编辑态反馈、焦点/连接反馈、运行态反馈必须严格区分，避免把 `running` 颜色继续借给纯编辑交互。

## 关联文档

- `DESIGN.md`
- `../dify/web/app/components/workflow/operator/control.tsx`
- `../dify/web/app/components/workflow/workflow-preview/components/zoom-in-out.tsx`
- `../dify/web/app/components/workflow/nodes/_base/node.tsx`
