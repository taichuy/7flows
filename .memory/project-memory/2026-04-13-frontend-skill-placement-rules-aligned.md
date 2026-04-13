---
memory_type: project
topic: frontend-development skill 已补目录与 API 放置判断规则
summary: 用户确认 `web/AGENTS.md` 保持短而硬的本地规则，`frontend-development` skill 则补充目录落点、组件上提、API 分层和工具分层的判断方法，避免二者重复。
keywords:
  - frontend
  - skill
  - placement
  - api
  - shared-ui
  - utils
match_when:
  - 需要使用或更新 `frontend-development` skill
  - 需要判断前端代码该放哪一层
  - 需要区分 `web/AGENTS.md` 和 skill 的职责边界
created_at: 2026-04-13 16
updated_at: 2026-04-13 16
last_verified_at: 2026-04-13 16
decision_policy: verify_before_decision
scope:
  - .agents/skills/frontend-development
  - web/AGENTS.md
---

# frontend-development skill 已补目录与 API 放置判断规则

## 时间

`2026-04-13 16`

## 谁在做什么

用户在收紧 `web/AGENTS.md` 后，进一步要求判断是否有必要把目录分层规则补进 `frontend-development` skill。AI 给出“补轻量判断规则，不复制本地硬约束”的建议，用户确认采用。随后 skill 新增了目录落点、组件上提、API 分层和工具分层的 reference。

## 为什么这样做

仅靠 `web/AGENTS.md` 可以约束“不要乱放”，但不能解决 AI 在真实实现中最常见的边界判断题，例如组件该不该上提到 `shared/ui`、请求该不该进 `shared/api`、工具类该不该进入 `shared/utils`。

## 为什么要做

需要让 `frontend-development` skill 承担“判断方法”的职责，而 `web/AGENTS.md` 只保留本地硬规则和验证要求，避免两个入口重复或互相打架。

## 截止日期

无

## 决策背后动机

当前前端仍处于 bootstrap 阶段，很多实现边界尚未稳定。把放置判断写进 skill，可以让未来 AI 在相似场景下直接复用，而不需要每次都回到 spec 或重新讨论；同时保持 `web/AGENTS.md` 短小、直接、面向本地执行。

## 关联文档

- `.agents/skills/frontend-development/SKILL.md`
- `.agents/skills/frontend-development/references/placement-rules.md`
- `web/AGENTS.md`
