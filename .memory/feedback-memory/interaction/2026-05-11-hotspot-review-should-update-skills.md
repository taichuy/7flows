---
memory_type: feedback
feedback_category: interaction
topic: hotspot-review-should-update-skills
summary: 用户纠正热点变更复盘的输出重点：不要只给业务代码修复建议，要抽象为 AI 下次不犯同类错误的 skill、规则或代码环境优化。
created_at: 2026-05-11 13
updated_at: 2026-05-11 13
decision_policy: direct_reference
match_when:
  - 用户要求检查昨天和今天代码热点
  - 用户要求分析哪些代码反复修改、为什么反复修改
  - 用户要求优化 Hermes 或 AI agent 开发环境
  - 输出建议涉及 skills、AGENTS、质量门禁或代码环境
---

# Hotspot Review Should Update Skills

## 规则

当用户要求分析近两天、昨天/今天或近期热点修改时，默认目标是提升 AI 下一次开发效率和减少重复错误。输出应优先给出应该更新哪些 `skills / AGENTS / 质量脚本 / 代码环境规则`，而不是只建议修业务代码。

## 原因

用户要的是让 AI 编程环境吸收这次反复修改暴露出的逻辑缺口；单纯指出业务代码怎么修，不能防止下一轮 AI 在相同类型任务中继续犯错。

## 适用场景

- 高频 churn 复盘
- Hermes / agent 开发环境优化
- AI 编程效率优化
- 需要把代码热点抽象成流程、skill、门禁或本地规则的场景
