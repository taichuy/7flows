---
memory_type: project
topic: 后端 QA 修复计划已按 remediation 专题 A-D 拆分
summary: 用户明确要求当前后端整改按总设计稿专题拆分，而不是按已实现模块 01 再拆；当前执行入口改为 access control、session auth、route openapi、runtime registry 四份 remediation plan。
keywords:
  - backend
  - qa
  - remediation
  - plans
  - access-control
  - session
  - openapi
  - runtime-registry
match_when:
  - 需要继续编写或执行 2026-04-13 backend QA remediation 计划
  - 需要判断计划拆分应按模块还是按专题
created_at: 2026-04-13 14
updated_at: 2026-04-13 14
last_verified_at: 2026-04-13 14
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-13-backend-qa-remediation-design.md
  - docs/superpowers/plans/2026-04-13-backend-qa-access-control-closure.md
  - docs/superpowers/plans/2026-04-13-backend-qa-session-auth-closure.md
  - docs/superpowers/plans/2026-04-13-backend-qa-route-openapi-alignment.md
  - docs/superpowers/plans/2026-04-13-backend-qa-runtime-registry-closure.md
---

# 后端 QA 修复计划已按 remediation 专题 A-D 拆分

## 时间

`2026-04-13 14`

## 谁在做什么

用户确认总设计讨论没有原则性问题后，要求把后端 QA 修复拆成多个后端落地 plan。当前不再按模块 01 拆分，而是直接按总设计稿的四个 remediation 专题拆分执行入口。

## 为什么这样做

`01-user-auth-and-team` 是已经实现的既有模块，不是这轮整改计划的拆分依据。真正需要拆的是当前 QA remediation spec 本身，它已经在第 9 节把工作明确收敛为 A-D 四个独立专题。

## 为什么要做

这样可以让每份 plan 都直接对应一个整改目标：

- 权限与访问控制闭环
- 会话与认证闭环
- 路由与 OpenAPI 契约收口
- 状态入口与 registry 收口

避免把“已有业务模块”与“当前整改专题”混成一层，减少执行阶段的误拆和范围漂移。

## 截止日期

当前轮没有新增单独硬截止时间，按专题顺序推进。

## 决策背后动机

核心动机是让 remediation plan 的边界直接对齐 remediation spec，而不是对齐历史模块目录；这样后续执行和回归时，可以直接以专题通过条件为准，而不是再做一次人工映射。
