---
memory_type: feedback
feedback_category: repository
topic: 子目录 AGENTS 应内联关键本地规则，不把 AI 先引到长 spec
summary: 当为某个子目录编写 `AGENTS.md` 时，关键目录约束、必用 skill 和本地硬规则应直接写在该文件里，尽量简短，不要让 AI 先跳转到更长 spec 才能知道最重要的约束。
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
created_at: 2026-04-13 16
updated_at: 2026-04-13 16
last_verified_at: 2026-04-13 16
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
  - 必用 skill
  - 目录约束
  - 本地硬规则
  - 必要验证
- 内容应尽量简短，优先一屏到一屏半内完成。
- 不应把最关键的本地规则仅放在长 spec 中，再让 AI 先跳转阅读。

## 原因

目录级 `AGENTS.md` 的价值是让进入该目录工作的 AI 立即拿到当前最重要的本地约束。如果还要先读一份更长的 spec，最关键的规则反而会被稀释，执行稳定性会下降。

## 适用场景

- 为 `web/`、`api/` 或其他子目录维护目录级 AI 规则
- 需要决定“哪些规则直接写在 AGENTS，哪些放到 skill/spec”
- 用户明确要求目录级规则更短、更直接
