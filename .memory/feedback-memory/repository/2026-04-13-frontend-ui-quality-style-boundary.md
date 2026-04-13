---
memory_type: feedback
feedback_category: repository
topic: 前端验收必须把 UI 质量和样式边界当成硬门禁
summary: 前端任务验收不能只看“能跑”，风格和 UI 质量本身就是验收项；主题层统一允许，但禁止无边界递归覆盖第三方组件内部样式链，尤其不能把 `Ant Design` 原生布局打坏。
keywords:
  - frontend
  - ui-quality
  - style-boundary
  - ant-design
  - qa
match_when:
  - 需要制定或执行前端验收标准
  - 需要评估第三方组件样式覆写是否合格
  - 需要补 frontend skill 或 QA 门禁
created_at: 2026-04-13 13
updated_at: 2026-04-13 13
last_verified_at: 2026-04-13 13
decision_policy: direct_reference
scope:
  - DESIGN.md
  - .agents/skills/frontend-development
  - .agents/skills/qa-evaluation
---

# 前端验收必须把 UI 质量和样式边界当成硬门禁

## 时间

`2026-04-13 13`

## 规则

- 前端风格和 UI 质量本身就是验收项，不能只以“功能可用”判通过。
- 主题颜色、圆角、阴影、字体等通用风格统一允许通过主题层修改。
- 禁止无边界递归覆盖第三方组件内部样式链，尤其不能把 `Ant Design` 原生布局和交互打坏。
- 需要第三方组件内部样式覆写时，必须说明边界、blast radius 和验证证据。

## 原因

本次导航下拉问题的根因不是功能逻辑，而是共享样式无边界地覆盖了 `Ant Design` 菜单内部布局，导致原生组件样式被破坏。如果 QA 只看“菜单能打开”，这类问题会被放过。

## 适用场景

- 前端页面、导航、共享壳层、主题和菜单样式改动
- QA 评估前端实现质量
- 编写或更新前端开发 skill、测试 checklist、设计规范
