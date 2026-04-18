---
memory_type: project
topic: 控制台壳层与认证设置区进入实施计划阶段
summary: 用户在 `2026-04-14 07` 确认 `docs/superpowers/specs/1flowbase/2026-04-13-console-shell-auth-settings-design.md` 没有原则性问题，并要求直接落成正式 implementation plan；执行入口固定为 `docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md`。
keywords:
  - frontend
  - auth
  - settings
  - plan
  - shell
match_when:
  - 需要继续执行控制台壳层、登录态、设置页或个人资料页计划
  - 需要判断本轮 shell/auth/settings 是否已从 spec 进入实施阶段
created_at: 2026-04-14 07
updated_at: 2026-04-14 07
last_verified_at: 2026-04-14 07
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowbase/2026-04-13-console-shell-auth-settings-design.md
  - docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md
  - web
  - api/apps/api-server
---

# 控制台壳层与认证设置区进入实施计划阶段

## 时间

`2026-04-14 07`

## 谁在做什么

- 用户确认当前设计稿可以直接进入落地计划，不再回到设计讨论环节。
- AI 负责把前端壳层、认证接入、设置区和后端补口收束成可执行计划文档。

## 为什么这样做

- 当前 spec 已经冻结了正式控制台的导航、页面边界和后端缺口，继续停留在设计稿不会再减少实现风险。
- 现有仓库仍保留 bootstrap shell、伪造权限 key 和缺失的 `/me` 更新口，必须通过一个固定 plan 把顺序和验证收紧。

## 为什么要做

- 后续实现需要一个单一执行入口，避免前后端同时推进时回到“边看 spec 边猜下一步”的状态。
- 用户要求设置页、登录态和个人资料页作为一轮完整闭环推进，而不是零散补页面。

## 截止日期

- 无

## 决策背后动机

- 先补后端 `csrf_token` 恢复和 `PATCH /api/console/me`，再推进前端 auth/session 状态，能减少前端实现中的临时兼容层。
- 路由真值层需要同步从假权限 key 迁到真实 permission catalog，否则 guard 永远只是装饰。
- `设置` 作为 session-only 主页面，内部再按 `user.* / role_permission.*` 权限决定版块显隐，比给整个 `/settings` 绑一个错误的单权限更稳。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-13-console-shell-auth-settings-design.md`
- `docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md`
