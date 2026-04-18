---
memory_type: project
topic: 角色权限策略与默认新用户角色计划已落地完成
summary: `docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md` 已在 `2026-04-14 21` 落地完成，后端已支持 `auto_grant_new_permissions` 与 `is_default_member_role`，成员创建改为解析工作空间当前默认角色，设置页已可管理这两个策略位，并完成后端/前端全量验证。
keywords:
  - role
  - permissions
  - auto_grant_new_permissions
  - is_default_member_role
  - member
  - settings
match_when:
  - 需要判断角色策略位计划是否已经进入已实现状态
  - 需要继续扩展角色管理、成员创建默认角色或新增权限自动授予逻辑
  - 需要确认这轮计划是否已经完成全量验证
created_at: 2026-04-14 21
updated_at: 2026-04-14 21
last_verified_at: 2026-04-14 21
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-14-role-auto-grant-new-permissions.md
  - docs/superpowers/specs/1flowbase/2026-04-14-role-auto-grant-new-permissions-design.md
  - api/apps/api-server
  - api/crates/control-plane
  - api/crates/storage-pg
  - web/app
  - web/packages/api-client
---

# 角色权限策略与默认新用户角色计划已落地完成

## 时间

`2026-04-14 21`

## 谁在做什么

- AI 按计划完成角色策略位、默认新用户角色解析、设置页管理能力与验证收尾。
- 用户已经确认该计划可以直接执行，并要求同步维护计划进度以便追踪。

## 为什么这样做

- 角色之前缺少“自动接收未来新增权限”和“默认新用户角色”两个稳定策略位。
- 成员创建链路把默认角色硬编码成 `manager`，不满足工作空间级动态切换需求。
- 设置页需要把这两个策略直接暴露给管理员，而不是继续依赖隐式后端约定。

## 为什么要做

- 新权限上线后，需要让选中的角色自动获得未来新增权限。
- 工作空间需要随时切换默认新用户角色，并保证同时只能有一个默认角色。
- 前后端合同、测试和设置页交互需要形成闭环，避免策略位只存在于数据库。

## 截止日期

- 无

## 决策背后动机

- `admin` 保持 `auto_grant_new_permissions = true`。
- `manager` 保持默认新用户角色。
- 默认角色切换只影响未来新建用户，不回填历史用户。
- 仓库层保证同一 workspace 只能有一个默认新用户角色，并拒绝把当前唯一默认角色直接清空。
- 设置页通过简单复选框暴露两个策略位，维持低复杂度交互。
- 本轮已完成 `verify-backend`、`web lint`、`web test` 与 `web/app build`。
