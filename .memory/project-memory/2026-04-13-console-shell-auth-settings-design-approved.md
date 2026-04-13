---
memory_type: project
topic: 控制台壳层与认证设置区设计已确认
summary: 用户已确认正式控制台壳层改造方向：顶部改为工作台/子系统/工具/设置/用户，删除 bootstrap 演示路由，前端本轮补登录页、个人资料页、设置页，并同步补后端 `PATCH /api/console/me` 与会话 `csrf token` 恢复字段。
keywords:
  - frontend
  - auth
  - settings
  - shell
  - me
  - csrf
match_when:
  - 需要继续实现控制台壳层、登录态、设置页或个人资料页
  - 需要判断本轮前后端联动改造的冻结范围
created_at: 2026-04-13 22
updated_at: 2026-04-13 22
last_verified_at: 2026-04-13 22
decision_policy: verify_before_decision
scope:
  - web
  - api/apps/api-server
  - docs/superpowers/specs/1flowse/2026-04-13-console-shell-auth-settings-design.md
---

# 控制台壳层与认证设置区设计已确认

## 时间

`2026-04-13 22`

## 谁在做什么

- 用户确认当前控制台前端不再沿用 bootstrap 演示壳层，要求同时完成壳层收口、真实登录态接入、个人资料页和设置页。
- AI 负责把确认后的结构写成正式 spec，并准备后续 implementation plan。

## 为什么这样做

- 当前 `web` 虽然 lint/test/build 已通过，但界面、路由和账户区仍残留 bootstrap/demo 语义，无法作为正式控制台继续扩展。
- 前端要接用户、退出、用户管理、权限管理时，必须把登录态、`csrf`、`401/403` 行为和页面边界一次性收口。

## 为什么要做

- 先固定控制台入口与页面边界，后续用户、权限、工具等能力才能挂在稳定壳层里继续演进。
- 用户要求设置页采用“左侧边栏 + 右侧内容”结构，并明确当前阶段只保留 API 文档、用户管理、权限管理。

## 截止日期

- 无

## 决策背后动机

- 顶部导航冻结为：
  - 左侧：`工作台 / 子系统 / 工具`
  - 右侧：`设置` 独立入口，`用户` 保持下拉
- `/embedded-apps` 继续保留路径，只把对外文案改为“子系统”。
- `agent-flow`、`embedded-runtime`、子系统详情页和挂载页全部删除，不再保留孤岛路由。
- 工具页本轮保留入口，但内容为正式“建设中”页。
- `设置` 页面只包含：
  - `API 文档`
  - `用户管理`
  - `权限管理`
- `API 文档` 在设置页中以内嵌 `iframe` 的方式承载后端 `/docs`。
- `/me` 页面合并“基本资料 + 安全设置”两个区块。
- 当前用户只能编辑自己的资料字段；其他用户信息变更由用户管理页处理。
- 后端本轮需要补：
  - `PATCH /api/console/me`
  - `GET /api/console/session` 返回 `csrf_token`
- “退出全部设备”不作为前端单独动作暴露，只保留当前设备退出；全端失效继续由改密和管理员重置密码触发。

## 关联文档

- `docs/superpowers/specs/1flowse/2026-04-13-console-shell-auth-settings-design.md`
