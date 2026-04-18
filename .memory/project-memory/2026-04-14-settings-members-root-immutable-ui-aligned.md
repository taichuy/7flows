---
memory_type: project
topic: 设置区成员面板已对齐 root 账号不可变规则
summary: 用户在 `/settings/members` 明确确认 root 账号不能停用；当前前端已禁用 root 的角色编辑、停用、重置密码入口，并新增前后端测试锁定 `root_user_immutable` 拒绝。
keywords:
  - settings
  - members
  - root
  - immutable
  - frontend
  - backend
  - test
match_when:
  - 需要继续调整 `/settings/members`
  - 需要判断 root 账号在成员列表中的可写边界
  - 需要排查 root 写操作为何前端禁用或后端 403
created_at: 2026-04-14 20
updated_at: 2026-04-14 20
last_verified_at: 2026-04-14 20
decision_policy: verify_before_decision
scope:
  - web/app/src/features/settings
  - api/apps/api-server/src/_tests/member_routes.rs
  - docs/superpowers/specs/1flowbase/modules/01-user-auth-and-team/README.md
---

# 设置区成员面板已对齐 root 账号不可变规则

## 时间

`2026-04-14 20`

## 谁在做什么

- 用户在 `/settings/members` 截图中指出 `Root` 行仍暴露“停用”按钮，并明确要求“无法停用，前端直接禁止，后端直接拒绝”。
- AI 在现有实现上补齐了前端禁用态，并为前后端分别补了回归测试。

## 为什么这样做

- 既有后端实际已经拒绝 `root` 停用，但前端仍暴露可点击入口，导致成员管理页与系统规则不一致。
- `root` 的角色编辑、停用、重置密码都属于同类不可变写操作，前端需要一次性和后端边界对齐。

## 为什么要做

- 避免管理员在设置页对 `root` 发起本就不会成功的写操作。
- 用测试锁定“不允许停用 root”这条规则，避免后续 settings 改造或接口调整时回退。

## 截止日期

- 无

## 决策背后动机

- 前端现在对 `root` 行直接禁用角色编辑、停用、重置密码按钮，普通成员保持原有可操作状态。
- 后端继续使用 `root_user_immutable` 作为拒绝码，并新增路由测试确认 `POST /api/console/members/{root}/actions/disable` 返回 `403`。
