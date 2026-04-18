---
memory_type: project
topic: 插件接口扩展仅限 host 级
summary: `runtime extension`（原 `tenant-runtime`）与 `capability plugin`（原 `runner/plugin`）不允许注册或扩展系统接口，只能实现宿主预定义的白名单能力槽位；接口扩展能力仅开放给 `core` 与 `host-extension`。
keywords:
  - plugin
  - host-extension
  - tenant-runtime
  - runtime-extension
  - runner
  - capability-plugin
  - interface
  - security
match_when:
  - 需要设计插件扩展系统接口
  - 需要判断多租户场景下哪些插件可以注册接口
  - 需要区分 host 插件与 runtime 插件能力边界
created_at: 2026-04-12 21
updated_at: 2026-04-12 21
last_verified_at: 2026-04-12 21
decision_policy: verify_before_decision
scope:
  - api
  - plugin system
  - auth provider
  - resource registry
---

# 插件接口扩展仅限 host 级

## 时间

`2026-04-12 21`

## 谁在做什么

- 用户在讨论后端工程规范和插件扩展边界时，进一步明确了插件信任分层。
- AI 需要把接口扩展注册能力与普通运行时插件能力彻底分开，避免未来多租户数据泄露风险。

## 为什么这样做

- 如果 `runtime extension` 或 `capability plugin` 能直接注册系统接口，未来多租户场景下很容易绕过宿主级鉴权、租户隔离和敏感数据边界。
- 认证扩展、公开 callback、系统资源动作都属于高敏感能力，不适合开放给普通运行时插件。

## 为什么要做

- 先固定插件信任模型，后续再做动态建模、运行时 CRUD、hosted auth provider 和插件生态时，能一直沿同一边界推进。
- 降低“插件直接暴露接口导致内部数据泄露”的系统性风险。

## 截止日期

- 未指定

## 决策背后动机

- `core` 与 `host-extension` 可以参与系统接口扩展，包括注册 resource、auth provider 和经审批的 raw callback。
- `runtime extension` 与 `capability plugin` 不允许注册接口，也不允许扩展系统接口。
- `runtime extension` 与 `capability plugin` 只能实现宿主预定义的白名单能力槽位，不能自行发明新的扩展点。
- `runtime extension` 与 `capability plugin` 只能按权限读取或操作宿主开放的数据能力，不能直接触达系统控制面接口、底层存储和 HTTP 契约。
- 当前白名单能力口径为：
  - `runtime extension`：`runtime.query.scope_resolver`、`runtime.record.validator`、`runtime.field.default_value`、`runtime.field.computed_value`
  - `capability plugin`：`runner.node.execute`、`runner.datasource.read`、`runner.datasource.schema`、`runner.publish.render`、`runner.publish.deliver`
- 二者的差别不在是否采用插件包交付，而在宿主如何消费：
  - `runtime extension` 绑定模型或应用的 runtime 槽位
  - `capability plugin` 在节点、数据源、发布或 provider 配置中被显式选择
- 当前工作区内的启用链路固定为：安装 -> 启用 -> 分配 -> 绑定 -> 使用；团队安装本身不等于全员自动可用。
- 明确不开放：`http.route.register`、`resource.register`、`auth.provider.register`、`raw_route.register`、`openapi.register`、`system.user_role_auth.access`、`session.cookie.control`、`db.pool.direct_access`
- 认证扩展继续沿 `hosted provider` 方向设计，避免每个插件自行开认证入口。

## 关联文档

- `docs/superpowers/specs/1flowbase/2026-04-12-auth-team-access-control-backend-design.md`
