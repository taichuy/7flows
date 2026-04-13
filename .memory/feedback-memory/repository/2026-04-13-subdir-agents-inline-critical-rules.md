---
memory_type: feedback
feedback_category: repository
topic: 子目录 AGENTS 应内联关键本地规则，不把 AI 先引到长 spec
summary: 当为某个子目录编写 `AGENTS.md` 时，关键目录约束和本地硬规则应直接写在该文件里，尽量简短且单一；只保留稳定高频规则与模板，不要要求先读其他 AGENTS、跳转长 spec，或把会随实现变化消失的代码事实塞进去。
keywords:
  - AGENTS
  - frontend
  - spec
  - local-rules
  - inline
match_when:
  - 需要编写或重写子目录 `AGENTS.md`
  - 需要决定关键规则写在 AGENTS 还是长文档里
  - 用户要求让目录级规则更短、更直接
  - 用户要求目录级 AGENTS 只保留稳定高频硬规则和模板
created_at: 2026-04-13 16
updated_at: 2026-04-13 21
last_verified_at: 2026-04-13 21
decision_policy: direct_reference
scope:
  - web/AGENTS.md
  - AGENTS.md
  - docs/superpowers/specs
---

# 子目录 AGENTS 应内联关键本地规则，不把 AI 先引到长 spec

## 时间

`2026-04-13 16`

## 规则

- 子目录 `AGENTS.md` 应直接写清：
  - 作用域
  - 目录约束
  - 本地硬规则
  - 高频模板
  - 必要验证
- 内容应尽量简短，优先一屏到一屏半内完成。
- 不应把最关键的本地规则仅放在长 spec 中，再让 AI 先跳转阅读。
- 不应要求进入子目录后再先阅读其他 `AGENTS.md`，也不应把主体内容做成长文引用索引。
- 规则应优先写稳定、不过时、高频的硬约束，不要把临时背景或解释性文字堆进去。
- 会随着当前实现收口而消失的“代码事实”不应写成 AGENTS 硬规则，应直接以代码本身作为真相来源。

## 原因

目录级 `AGENTS.md` 的价值是让进入该目录工作的 AI 立即拿到当前最重要的本地约束。如果还要先读一份更长的 spec，最关键的规则反而会被稀释，执行稳定性会下降。

## 适用场景

- 为 `web/`、`api/` 或其他子目录维护目录级 AI 规则
- 需要决定“哪些规则直接写在 AGENTS，哪些放到 skill/spec”
- 用户明确要求目录级规则更短、更直接
- 用户要求给出类似“禁止事项 + 统一命令 + 最低模板”的简短结构
- 用户明确指出“代码事实不需要强制约定”，要求 AGENTS 只保留长期稳定规则
