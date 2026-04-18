---
memory_type: project
topic: 设置区 API 文档按需加载设计进入实施计划阶段
summary: 用户在 `2026-04-14 17` 确认 `2026-04-14-settings-api-docs-on-demand-design.md` 无原则性问题，并要求直接整理为正式 implementation plan；执行入口固定为 `docs/superpowers/plans/2026-04-14-settings-api-docs-on-demand.md`。
keywords:
  - settings
  - api docs
  - openapi
  - plan
  - scalar
match_when:
  - 需要继续实现设置区 API 文档按需加载
  - 需要判断该专题是否已从 spec 进入计划阶段
  - 需要定位本轮 API 文档专题的执行入口
created_at: 2026-04-14 17
updated_at: 2026-04-14 17
last_verified_at: 2026-04-14 17
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-14-settings-api-docs-on-demand-design.md
  - docs/superpowers/plans/2026-04-14-settings-api-docs-on-demand.md
  - web/app/src/features/settings
  - api/apps/api-server
---

# 设置区 API 文档按需加载设计进入实施计划阶段

## 时间

`2026-04-14 17`

## 谁在做什么

- 用户确认设置区 API 文档按需加载设计稿没有原则性问题，要求直接整理成正式实施计划。
- AI 负责把后端文档注册表、受保护文档接口、前端目录搜索与 Scalar 详情渲染拆成可执行任务。

## 为什么这样做

- 当前设计结论已经冻结，继续停留在 spec 讨论不会再减少实现不确定性。
- 前后端实现点跨 `api-server`、权限目录、`api-client`、设置页和样式边界，需要一个单一 plan 作为后续执行入口。

## 为什么要做

- 当前 `/settings/docs` 仍是后端 Swagger `iframe`，既没有独立权限，也不符合“目录先行、详情按需”的目标。
- 用户需要后续在同一专题里直接按任务推进，而不是每次再从设计稿回推实施顺序。

## 截止日期

- 无

## 决策背后动机

- 先固化计划，再执行实现，能避免后端文档裁剪、前端深链和权限回退在落地时相互打架。
- 把计划入口固定到 `docs/superpowers/plans/2026-04-14-settings-api-docs-on-demand.md`，后续执行、验收和状态回填都会更直接。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-14-settings-api-docs-on-demand-design.md`
- `docs/superpowers/plans/2026-04-14-settings-api-docs-on-demand.md`
