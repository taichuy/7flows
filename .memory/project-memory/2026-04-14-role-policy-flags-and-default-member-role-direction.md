---
memory_type: project
topic: 角色权限策略与默认新用户角色方向已确认
summary: 用户确认角色模型本轮同时新增 `auto_grant_new_permissions` 与 `is_default_member_role` 两个策略位；`admin` 默认自动接收新增权限，`manager` 默认作为新建用户默认角色，默认角色切换只影响未来新建用户，不回填历史用户。
keywords:
  - role
  - permissions
  - auto_grant_new_permissions
  - is_default_member_role
  - manager
  - member
match_when:
  - 需要实现角色自动接收新增权限
  - 需要实现新建用户默认角色
  - 需要判断默认角色切换是否回填已有用户
created_at: 2026-04-14 20
updated_at: 2026-04-14 20
last_verified_at: 2026-04-14 20
decision_policy: verify_before_decision
scope:
  - api
  - web
  - docs/superpowers/specs/1flowbase/2026-04-14-role-auto-grant-new-permissions-design.md
  - docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md
---

# 角色权限策略与默认新用户角色方向已确认

## 时间

`2026-04-14 20`

## 谁在做什么

用户在角色自动接收新增权限需求上继续补充约束，AI 负责把“默认新用户角色”并入同一轮设计与实施计划。

## 为什么这样做

当前后端在成员创建链路里把默认角色硬编码成 `manager`，同时角色模型也缺少“自动接收新增权限”的策略位，导致角色策略无法配置、也无法作为长期稳定规则继续扩展。

## 为什么要做

- 新权限目录增加后，需要让特定角色自动补齐未来新增权限。
- 新建用户默认角色不应继续依赖写死 `manager`，而应成为角色级可配置策略。
- 设置页希望继续维持简单勾选交互，不引入新的复杂规则系统。

## 截止日期

无

## 决策背后动机

- 角色上同时新增：
  - `auto_grant_new_permissions`
  - `is_default_member_role`
- 内建默认：
  - `admin.auto_grant_new_permissions = true`
  - `manager.auto_grant_new_permissions = false`
  - `manager.is_default_member_role = true`
- 默认新用户角色在同一 workspace 内只能有一个。
- 把某角色设为默认角色时，应自动清除同 workspace 其他角色的默认位。
- 不允许把当前唯一默认角色直接清空成“没有默认角色”。
- 默认角色切换只影响未来新建用户，不自动迁移已有用户。
