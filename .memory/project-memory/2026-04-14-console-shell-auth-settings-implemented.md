---
memory_type: project
topic: 控制台壳层、认证、设置页与个人资料页已完成一体化落地
summary: `docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md` 已在 `2026-04-14 08` 落地完成，包含后端 `PATCH /api/console/me` 与 `csrf_token` 合同补齐、正式 console shell、auth bootstrap、`/settings`、`/me`、style-boundary 刷新，以及本地开发态凭证式 CORS 修正。
keywords:
  - frontend
  - backend
  - auth
  - settings
  - me
  - cors
match_when:
  - 需要判断 console shell/auth/settings 计划是否已经进入已实现状态
  - 需要继续扩展 `/settings`、`/me`、session bootstrap 或 style-boundary 场景
  - 需要知道本地开发态 3100 -> 7800 的 credentialed CORS 缺口是否已经修正
created_at: 2026-04-14 08
updated_at: 2026-04-14 08
last_verified_at: 2026-04-14 08
decision_policy: verify_before_decision
scope:
  - docs/superpowers/plans/2026-04-14-console-shell-auth-settings.md
  - docs/superpowers/specs/1flowbase/2026-04-13-console-shell-auth-settings-design.md
  - api/apps/api-server
  - api/crates/control-plane
  - web/app
  - web/packages/api-client
---

# 控制台壳层、认证、设置页与个人资料页已完成一体化落地

## 时间

`2026-04-14 08`

## 谁在做什么

- AI 按计划一次性完成了 console shell、登录态恢复、设置页、个人资料页和后端合同补口。
- 用户已经明确接受该计划，不再回到 design/spec 讨论阶段。

## 为什么这样做

- 旧 bootstrap shell、假权限 key、缺失的 `/me` 更新口和本地开发态 CORS 缺口会让正式控制台无法形成闭环。
- 把前后端、类型层、style-boundary 和浏览器验收放在同一轮推进，能避免一边写页面一边猜接口。

## 为什么要做

- 正式控制台需要稳定的 session bootstrap、真实 settings 管理面板和可编辑的个人资料页。
- 本地开发环境必须允许 `web/app:3100` 通过带凭证请求访问 `api-server:7800`，否则手工验收和真实联调都会卡死。

## 截止日期

- 无

## 决策背后动机

- 后端先补 `PATCH /api/console/me` 与 `GET /api/console/session` 的 `csrf_token`，前端才能去掉临时兼容层。
- `CorsLayer::permissive()` 不适合 `credentials: include` 的前端请求；最终方案改为 router 级 `mirror_request` 策略，保证 merged routes 和预检请求都能返回可用的 CORS 头。
- style-boundary manifest 只保留活跃路由并补齐 `tools/settings/me` 场景，能让共享壳层回归覆盖与实际路由树对齐。
