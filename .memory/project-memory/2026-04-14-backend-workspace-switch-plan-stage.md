---
memory_type: project
topic: backend governance follow-up 已进入 workspace switch 实施计划阶段
summary: 在第二阶段后端治理主计划已完成的前提下，用户于 `2026-04-14 09` 要求基于更新后的治理设计继续落成 follow-up plan；当前执行入口固定为 `docs/superpowers/plans/2026-04-14-backend-workspace-switch.md`，范围只覆盖 backend workspace switch，不重开 tenant UI、命名清理或 runtime 修复工作流。
keywords:
  - backend
  - governance
  - workspace switch
  - plan
  - follow-up
match_when:
  - 需要继续执行第二阶段后端治理的后续计划
  - 需要判断新的治理计划是否应复用已完成历史 plan
  - 需要确认 backend workspace switch 的执行入口
created_at: 2026-04-14 09
updated_at: 2026-04-14 09
last_verified_at: 2026-04-14 09
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-13-backend-governance-phase-two-design.md
  - docs/superpowers/plans/2026-04-14-backend-workspace-switch.md
  - api
---

# backend governance follow-up 已进入 workspace switch 实施计划阶段

## 时间

`2026-04-14 09`

## 谁在做什么

当前由 AI 根据已回填更新的第二阶段后端治理设计稿，为 backend workspace switch 产出新的 follow-up implementation plan。

## 为什么这样做

原 `2026-04-13-backend-governance-phase-two` 主计划已经完成并归档，不能再把它当成当前实施入口；如果继续推进未落地项，需要用一份新的、范围更小的 follow-up plan 承接。

## 为什么要做

`current_workspace_id` 已经进入 session 和请求上下文，但还缺少“列出可切换 workspace”与“安全切换当前 workspace”这两个直接承接治理设计的后端能力。先补这一层，可以在不打开 tenant 产品面的前提下，继续把多 workspace 治理走通。

## 截止日期

无硬性外部截止日期；当前目标是把 backend workspace switch 明确为下一张执行计划。

## 决策背后动机

用户已确认更新后的治理 spec 需要继续落成计划，但现有历史 plan 已经完成。新的计划必须避免重复主计划，改为只覆盖依赖最少、最贴近当前后端治理边界的 follow-up slice。
