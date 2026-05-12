---
memory_type: feedback
feedback_category: repository
topic: 前端复制功能复用共享 clipboard
summary: 前端新增或修复复制文本功能时，优先复用已有共享 clipboard 工具或画布中的同类调用，不要直接依赖 navigator.clipboard。
keywords:
  - clipboard
  - copy-to-clipboard
  - copyTextToClipboard
  - 复制
match_when:
  - 修改前端按钮、弹窗、面板或画布中的复制文本功能
  - 看到浏览器提示不支持自动复制或 navigator.clipboard 兼容性问题
created_at: 2026-05-12 14
updated_at: 2026-05-12 14
last_verified_at: 2026-05-12 14
decision_policy: direct_reference
scope:
  - web/app/src/shared/ui/clipboard
  - web/app/src/features/agent-flow
  - web/app/src/features/applications
---

# 前端复制功能复用共享 clipboard

## 时间

`2026-05-12 14`

## 规则

前端新增或修复“复制”能力时，先搜索已有复制实现，优先复用 `shared/ui/clipboard/copy-text.ts` 的 `copyTextToClipboard` 或画布中同类调用模式。不要在业务组件里直接写 `navigator.clipboard` 作为唯一复制路径。

## 原因

项目里已经用 `copy-to-clipboard` 封装了兼容复制能力；直接依赖 `navigator.clipboard` 会在部分运行环境中出现“不支持自动复制”的提示，导致同类功能在不同页面表现不一致。

## 适用场景

- 弹窗中复制 token、密钥、变量值、JSON、调试输出等文本。
- 画布、调试控制台、API 页面、设置页等任意前端复制按钮。
- 修复复制失败、复制提示不一致、浏览器 clipboard API 不可用等问题。

## 备注

本规则来自 2026-05-12 修复应用 API Key 创建后弹窗复制失败：用户指出画布已有大量可复用复制实现，实际根因是新弹窗直接使用了 `navigator.clipboard`，没有复用共享 clipboard。
