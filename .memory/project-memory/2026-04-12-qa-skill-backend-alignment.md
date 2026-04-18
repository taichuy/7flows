---
memory_type: project
topic: qa-evaluation skill 已对齐最新后端规范
summary: `qa-evaluation` 已增强后端专项检查能力，后续评估后端任务时必须按最新接口内核、插件边界、工程质量规范和实施计划记忆对齐，而不能继续沿用旧后端口径。
keywords:
  - qa
  - skill
  - backend
  - evaluation
  - regression
match_when:
  - 需要使用或更新 qa-evaluation skill
  - 需要对后端任务做 QA 回归或项目级后端评估
created_at: 2026-04-12 23
updated_at: 2026-04-12 23
last_verified_at: 2026-04-12 23
decision_policy: verify_before_decision
scope:
  - .agents/skills/qa-evaluation
  - docs/superpowers/specs/1flowbase/2026-04-12-backend-interface-kernel-design.md
  - docs/superpowers/specs/1flowbase/2026-04-12-backend-engineering-quality-design.md
  - docs/superpowers/plans/2026-04-12-backend-kernel-and-quality-alignment.md
---

# qa-evaluation skill 已对齐最新后端规范

## 时间

`2026-04-12 23`

## 谁在做什么

用户要求在后端接口内核 spec、后端工程质量 spec 和后端实施计划已经更新后，同步升级 `qa-evaluation` skill，方便后续后端开发回归。

## 为什么这样做

原 QA skill 只覆盖通用任务和项目审计逻辑，没有吸收最新后端三平面、插件消费分类、resource kernel 和工程质量门禁，后续继续使用旧 QA 口径会产生误判。

## 为什么要做

让 QA skill 在评估后端任务时，能主动检查最新接口边界、状态入口、plugin/runtime 分类、repository/mapper 分层和验证命令，而不是只做泛化的 API/状态检查。

## 截止日期

无。

## 决策背后动机

- 不重写 QA skill 的 mode 和报告模板，只增强后端专项检查清单、严重级别提示和回归步骤。
- 命中后端评估时，必须先对齐 `.memory/project-memory` 中最近的后端规范、计划和插件边界记忆。
- 后端专项 QA 至少覆盖：
  - `public / control / runtime` 三平面
  - `host-extension / runtime extension / capability plugin` 边界
  - `route / service / repository / domain / mapper` 分层
  - `ApiSuccess`、`204`、统一错误结构
  - 后端验证命令和验证脚本
