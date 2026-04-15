---
memory_type: project
topic: 模块 02 权限与资源授权当前属于基础 ACL 已实现但资源消费面未闭环
summary: `docs/superpowers/specs/1flowse/modules/02-access-control/README.md` 在 `2026-04-15 08` 完成按代码事实核查。当前权限目录、默认角色、成员/角色管理、`state_model` 与 `state_data` ACL 已落地并通过专项测试；但最早期 README 中的完整资源清单、路由绑定资源授权、owner 接管与协作者机制仍未形成当前代码闭环，因此模块状态继续维持 `部分实现 / 口径漂移`，主线可先回到 `03 Flow 前置容器`。
keywords:
  - modules
  - access-control
  - acl
  - roles
  - members
  - runtime
  - mainline
match_when:
  - 需要判断模块 02 是否已经开发完成
  - 需要决定是否继续投入权限模块还是回到主线闭环
  - 需要把旧模块 README 与当前代码事实对齐
created_at: 2026-04-15 08
updated_at: 2026-04-15 08
last_verified_at: 2026-04-15 08
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/1flowse/modules/02-access-control/README.md
  - docs/superpowers/specs/1flowse/modules/README.md
  - api
  - web
---

# 模块 02 权限与资源授权当前属于基础 ACL 已实现但资源消费面未闭环

## 时间

`2026-04-15 08`

## 谁在做什么

- 用户要求重新核对 `02-access-control` 模块是否已经开发完成，并判断在大量架构和目录治理之后距离主线闭环还差多少。
- AI 对照模块 README、当前 `api`/`web` 代码和相关自动化测试，输出基于代码事实的状态判断。

## 为什么这样做

- `2026-04-10` 的模块 README 属于最早期模拟开发计划，里面混有“权限内核规则”“未来资源清单”“尚未真正出现的产品对象”三类内容。
- 如果继续把该 README 当成当前实现真相，会误判模块 02 的完成度，并拖慢主线回归。

## 为什么要做

- 当前主线需要优先回到 `03 -> 04 -> 07 -> 05/06B/08` 的闭环推进顺序。
- 需要先判断模块 02 还差的是“内核基础能力”还是“未来资源接入工作”，避免把后续业务资源的缺失误算成 ACL 基础设施未完成。

## 截止日期

- 无

## 决策背后动机

- 当前已落地并验证的部分：
  - 权限目录与 `resource.action.scope` 编码
  - `root/admin/manager` 默认角色模板
  - 角色策略位 `auto_grant_new_permissions`、`is_default_member_role`
  - 成员创建/停用/重置密码/角色绑定
  - 角色创建/更新/删除/替换权限
  - `state_model` 控制面 ACL
  - `state_data` runtime `own/all` ACL
  - 设置区按权限显示用户管理、权限管理和 API 文档
- 当前未闭环的部分：
  - `application/flow/publish_endpoint/route_page/external_data_source/plugin_config/embedded_app` 的真实业务资源与授权落点
  - “路由访问 + 路由绑定资源动作权限”的通用绑定模型
  - owner 转移、协作者接管、显式敏感配置授权等 README 中的产品能力
  - 按逐资源矩阵重写模块 README

## 关键结论

- 模块 02 不是“未开始”，也不是“完整完成”；准确口径是：
  - 基础 ACL 内核已实现
  - 早期 README 中的完整资源授权产品闭环尚未实现
- 因此它应继续归类为 `部分实现 / 口径漂移`，而不是 `已实现基线`。
- 若目标是尽快回归主线闭环，当前不应继续在模块 02 上做大规模扩写；只需要：
  - 修正文档口径
  - 清理少量 `team/workspace` 术语漂移
  - 在后续 `03/04/06B/08` 新资源落地时按同一 ACL 模板接入即可
