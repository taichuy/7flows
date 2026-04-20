---
memory_type: feedback
feedback_category: repository
topic: style-boundary 只用于样式边界和样式扩散门禁
summary: `style-boundary` 工具只负责检测样式边界是否被打坏、文件影响面是否扩散失控，以及 page/component/style 三层映射是否声明清楚；manifest 只保留结构性、层级性的计算样式断言，不盯 gap、radius、shadow、color 这类视觉细节。
keywords:
  - style-boundary
  - frontend
  - qa
  - boundary
  - expansion
  - manifest
match_when:
  - 需要扩展或解释 `style-boundary` 工具的职责
  - 需要判断前端问题是否应交给 `style-boundary` 检测
  - 需要修改 `web/app/src/style-boundary/scenario-manifest.json` 或相关 skill 文案
created_at: 2026-04-13 15
updated_at: 2026-04-20 21
last_verified_at: 2026-04-20 21
decision_policy: direct_reference
scope:
  - web/app/src/style-boundary
  - scripts/node/check-style-boundary.js
  - .agents/skills/frontend-development
  - .agents/skills/qa-evaluation
---

# 规则

`style-boundary` 只用于样式边界和样式扩散门禁，不用于泛 UI 质量判断；`scenario-manifest.json` 只保留结构性、层级性的计算样式断言，用来确认样式在 page -> component -> style 的约定层级里生效。

# 原因

用户明确要求这套工具只约束样式有没有越界、有没有扩散、有没有守住页面/组件/样式三层边界；审美、信息架构和交互质量应由其他 QA 或设计评审手段负责。像 gap、radius、shadow、background 这类视觉细节不应该进入这层 gate，否则会把正常页面演进误判成边界失败。

# 适用场景

- 设计或修改 `scenario-manifest.json` 字段语义
- 编写 `check-style-boundary` 失败文案
- 更新 frontend/QA skill，解释 runtime 检查的职责边界
- 判断某个 CSS 值是否应该写进 `propertyAssertions`

# 备注

命中文案应优先使用“样式边界失败 / 样式扩散失败”，避免写成泛 QA 失败。manifest 默认只写 `display`、`flex-direction`、`grid`/`flex` 布局归属等结构性边界；不要默认写 `gap`、`radius`、`shadow`、`color`、`padding` 一类视觉值。
