---
memory_type: project
topic: backend workspace physical rename 进入计划阶段
summary: 用户已确认 `backend workspace physical rename` 设计方向可执行，后续以后端实现计划作为直接执行入口，不再保留设计待审状态。
keywords:
  - backend
  - workspace
  - rename
  - plan
  - physical-storage
match_when:
  - 需要继续执行 backend workspace physical rename
  - 需要判断 2026-04-14 这轮命名统一是否还在设计阶段
  - 需要确认当前执行入口是 spec 还是 plan
created_at: 2026-04-14 13
updated_at: 2026-04-14 13
last_verified_at: 2026-04-14 13
decision_policy: verify_before_decision
scope:
  - api
  - docs/superpowers/specs/1flowbase/2026-04-14-backend-workspace-physical-rename-design.md
  - docs/superpowers/plans/2026-04-14-backend-workspace-physical-rename.md
---

# backend workspace physical rename 进入计划阶段

## 时间

`2026-04-14 13`

## 谁在做什么

- 用户确认 `docs/superpowers/specs/1flowbase/2026-04-14-backend-workspace-physical-rename-design.md` 当前设计方向可以直接进入实施计划。
- AI 已把执行入口落到 `docs/superpowers/plans/2026-04-14-backend-workspace-physical-rename.md`，后续按该计划推进后端命名统一。

## 为什么这样做

- 当前问题已经不是继续讨论“是否要统一”，而是要把跨 `domain/control-plane/storage-pg/runtime-core/api-server` 的改动拆成可执行任务。
- 如果继续把实现步骤留在设计稿里，会混淆“最终规则”和“具体落地顺序”，不利于后续分任务执行和回填状态。

## 为什么要做

- 后续实现可以直接按计划执行 static control-plane、公开协议、数据建模定义作用域、runtime `scope_id` 和最终验证门禁。
- 让仓库内后续协作统一以 plan 为执行基线，避免重新开启同一轮命名设计讨论。

## 截止日期

- 未指定

## 决策背后动机

- 用户已明确认可当前 rename 设计，不需要再保留“待用户审阅”的状态。
- 本轮价值在于把一次性重命名的风险点拆开，保证执行时不会漏掉 migration、OpenAPI、权限码和 runtime 物理列。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-14-backend-workspace-physical-rename-design.md`
- `docs/superpowers/plans/2026-04-14-backend-workspace-physical-rename.md`
