# 1Flowse 后端 QA 问题收敛与修复总设计稿

日期：2026-04-13
状态：已完成当前轮设计确认，待用户审阅
关联文档：
- [2026-04-12-backend-interface-kernel-design.md](./2026-04-12-backend-interface-kernel-design.md)
- [2026-04-12-backend-engineering-quality-design.md](./2026-04-12-backend-engineering-quality-design.md)
- [2026-04-12-auth-team-access-control-backend-design.md](./2026-04-12-auth-team-access-control-backend-design.md)
- [2026-04-13-data-model-physical-table-design.md](./2026-04-13-data-model-physical-table-design.md)

设计参考：
- 本机 `../nocobase` 的 `packages/core/auth`
- 本机 `../nocobase` 的 `packages/plugins/@nocobase/plugin-auth`

## 1. 文档目标

本文档用于把当前后端 QA 审计中暴露出的系统性问题收敛成一份总设计稿，作为后续多个修复计划的统一设计基线。

本文档要解决的核心问题是：

- 当前控制面与运行时数据面的权限校验为什么不一致
- `state_model` 与 `state_data` 的 `own/all` 语义在 1Flowse 中到底如何落地
- 会话退出、全端失效、密码修改与密码重置应如何归到同一套会话安全规则
- 运行时 `app` 作用域应如何在当前版本中预留，而不把本轮修复扩大成新的业务能力开发
- OpenAPI、路由组织和运行时注册表刷新入口应如何重新收口，避免后端继续腐化

本文档只覆盖当前已确认范围：

- `state_model` 控制面权限修复
- `state_data` 运行时数据权限修复
- session / password / revoke-all 会话安全闭环
- runtime 路由与 OpenAPI 契约收口
- `runtime registry` 刷新入口收口
- `app runtime context` 的结构预留

本文档不覆盖：

- 忘记密码、邮件找回、reset token 流程
- 密码复杂度、历史密码、过期、锁定策略
- 字段级细粒度权限
- app 级独立角色体系与 app 级独立 ACL 计算
- 多团队切换、商业化多租户、外部身份提供方扩展
- 前端页面和交互改造

## 2. 当前问题归并

本轮 QA 暴露的问题不是若干孤立 bug，而是四类后端结构性问题叠加：

1. 权限与访问控制闭环缺失
   - runtime 数据面缺少 `state_data` ACL
   - `GET /api/console/models/:id` 绕过 `state_model.view` 校验
2. 会话与认证契约闭环缺失
   - 缺少当前设备退出
   - 缺少主动退出全部设备
   - 密码相关动作与 session 失效规则没有统一写成正式契约
3. 契约与文档漂移
   - OpenAPI 与真实暴露路由不一致
   - 旧路径与新接口规范没有完成统一
4. 状态入口与副作用收口不足
   - `runtime registry` 刷新仍挂在 route 层
   - 非 HTTP 入口未来复用时容易遗漏关键副作用

因此本轮不采用“逐条小修”的方式，而采用：

`一份总设计稿 + 多个专题修复计划`

## 3. 总体修复原则

### 3.1 稳定核心优先

本轮优先修复：

- 授权是否正确
- session 是否安全
- 契约是否可信
- 关键副作用是否收口

不把本轮修复扩写成新的平台大功能。

### 3.2 权限真实来源固定为后端实时校验

当前 1Flowse 的权限判断来源固定为：

- 每次请求通过 session 拿到 `user_id` 与 `team_id`
- 后端重新装载 `ActorContext`
- 根据持久化角色绑定和权限定义实时计算可用权限
- 再叠加 `own/all` 的资源范围判断

因此：

- session 中不缓存最终权限结果
- 角色或权限变化不要求强制全端退出
- 安全敏感操作是否全端失效，只由密码与账号状态规则决定

### 3.3 对外契约先统一，内部实现再分层

本轮所有外部路由、OpenAPI、响应结构和动作命名，必须先对齐到同一口径，再进入实现计划。

### 3.4 `app scope` 当前只做结构预留

本轮正式交付与验收仍然聚焦团队空间。

`app scope` 在本轮只做：

- 类型与作用域语义保留
- 路由结构预留
- runtime 引擎参数与 OpenAPI 结构预留

本轮不把它扩展成完整可用的业务能力，不补最小 `applications` 宿主对象，也不把它列入本轮通过条件。

## 4. 权限模型收敛

### 4.1 `state_model` 的资源归属语义

`state_model` 不按个人 ownership 定义。

固定规则如下：

- `team scope` 数据建模定义属于团队共享资源
- `app scope` 数据建模定义属于应用共享资源
- `state_model.view.own` 和 `state_model.manage.own` 当前不作为个人创建者语义使用
- 第一阶段控制面结构资源统一按作用域共享资源处理

换句话说：

- 数据建模定义不是“谁创建就只属于谁”的个人对象
- 后端应避免把 `created_by` 误当作 `state_model` 的访问范围依据

### 4.2 `state_data` 的 `own/all` 语义

`state_data` 第一阶段正式采用：

`own = created_by == actor_user_id`

固定规则如下：

- runtime record 的 `own` 判断基于运行时物理表系统字段 `created_by`
- `view/edit/delete/manage.own` 都以该字段为准
- `view/edit/delete/manage.all` 允许访问同一作用域下全部记录
- 本轮只采用宿主系统字段，不引入业务 owner 字段

同时明确保留扩展口：

- 后续允许把 `own` 判断扩展为“宿主默认规则 + 业务 owner 字段映射”
- 该扩展不进入本轮计划

### 4.3 `state_model` 与 `state_data` 的权限族关系

本轮继续沿用静态权限目录：

- `state_model.*`
- `state_data.*`

本轮不引入每个模型定义独立的动态权限码，例如：

- 不生成 `state_model.orders.*`
- 不生成 `state_data.orders.*`

原因是：

- 当前角色模板、权限目录和持久化结构都按静态资源族建立
- 本轮目标是把现有系统修正到一致可用，而不是引入动态权限系统

### 4.4 `acl_namespace` 的当前角色

`acl_namespace` 在本轮保留，但用途固定为：

- resource metadata
- 审计与未来扩展入口
- 后续动态 ACL 设计的预留字段

本轮不要求 `acl_namespace` 直接驱动角色与权限目录。

## 5. 会话与密码安全规则

### 5.1 当前设备退出

新增正式契约：

- `DELETE /api/console/session`

语义固定为：

- 删除当前 cookie 对应 session
- 清当前设备当前登录态
- 不影响其他设备

返回固定为：

- `204 No Content`

### 5.2 主动退出全部设备

新增正式契约：

- `POST /api/console/session/actions/revoke-all`

语义固定为：

- 当前用户主动使自己全部 session 失效
- 后端通过 bump 当前用户 `session_version` 完成全端失效

返回固定为：

- `204 No Content`

### 5.3 自助修改密码

新增正式契约：

- `POST /api/console/me/actions/change-password`

固定规则如下：

- 只能修改自己密码
- 请求体至少包含：
  - `old_password`
  - `new_password`
- 后端必须校验旧密码
- 成功后更新密码哈希
- 成功后 bump 当前用户 `session_version`

该动作属于安全敏感操作，因此旧 session 必须全部失效。

### 5.4 管理员重置他人密码

正式契约采用：

- `POST /api/console/members/:id/actions/reset-password`

固定规则如下：

- 这是“改别人密码”的动作
- 与自助改密码属于同一密码体系，但不是同一接口
- 请求体至少包含：
  - `new_password`
- 后端按现有成员/权限规则校验是否允许操作目标用户
- 成功后更新目标用户密码哈希
- 成功后 bump 目标用户 `session_version`

### 5.5 触发全端失效的动作范围

本轮固定以下动作会触发全端失效：

- 自助修改密码
- 管理员重置他人密码
- 禁用用户
- 用户主动退出全部设备

本轮明确不触发全端失效的动作：

- 角色变更
- 权限定义变更
- 角色权限绑定变更
- 当前设备单独退出

### 5.6 参考结论

本轮参考 `../nocobase` 的方向如下：

- 自助改密码与找回密码分开
- 密码变更后旧登录失效

但 1Flowse 本轮不照搬其 token 失效机制，而继续采用当前更适合本项目的：

- `session_version` 失效策略

## 6. 路由契约收口

### 6.1 动作型路由统一

本轮所有副作用动作统一采用：

`/actions/动作名`

因此正式口径固定为：

- `POST /api/console/me/actions/change-password`
- `POST /api/console/session/actions/revoke-all`
- `POST /api/console/members/:id/actions/disable`
- `POST /api/console/members/:id/actions/reset-password`

本轮不再继续维持旧风格：

- `/members/:id/reset-password`
- `/members/:id/disable`
- `/me/change-password`

### 6.2 team runtime 路径

当前版本正式交付的 runtime 路径继续保持：

- `GET /api/runtime/models/:model_code/records`
- `POST /api/runtime/models/:model_code/records`
- `GET /api/runtime/models/:model_code/records/:id`
- `PATCH /api/runtime/models/:model_code/records/:id`
- `DELETE /api/runtime/models/:model_code/records/:id`

### 6.3 `app runtime` 路径预留

本轮仅预留结构，不纳入交付验收：

- `GET /api/runtime/apps/:app_id/models/:model_code/records`
- `POST /api/runtime/apps/:app_id/models/:model_code/records`
- `GET /api/runtime/apps/:app_id/models/:model_code/records/:id`
- `PATCH /api/runtime/apps/:app_id/models/:model_code/records/:id`
- `DELETE /api/runtime/apps/:app_id/models/:model_code/records/:id`

固定规则如下：

- `app_id` 路径结构与 runtime engine 参数可以保留
- 本轮计划不要求把该路径做成正式可用 API
- 本轮不补 `applications` 权威对象
- 本轮不把 `app runtime` 放入通过条件

## 7. OpenAPI 收口

### 7.1 OpenAPI 必须成为真实契约

本轮后端所有已暴露的 public / control / runtime 路由，都必须进入 OpenAPI。

这包括但不限于：

- public auth
- session
- me
- team
- members
- roles
- permissions
- model definitions
- model fields
- team runtime records

### 7.2 OpenAPI 组织方式收口

本轮不只是“补齐遗漏项”，而是要把组织方式一起收口到正式口径：

- OpenAPI 由各资源模块导出
- 主入口负责组合，不长期散写

目标是避免未来新增路由时继续出现：

- 实际路由已暴露
- `/openapi.json` 未同步

### 7.3 runtime schema 表达

runtime record 的请求与响应在第一阶段允许使用通用 JSON schema 表达。

本轮不要求为每个动态模型自动生成精细 JSON schema。

## 8. `runtime registry` 刷新入口收口

### 8.1 收口原则

`runtime registry` 刷新不再由 route 手动调用。

本轮正式规则：

- route 只负责解析请求、提取上下文、调用应用层
- 数据建模定义变更引发的 registry 刷新，由应用层统一编排

### 8.2 刷新策略

本轮继续采用全量 `rebuild`。

不采用：

- route 层增量刷新
- repository 直接刷新进程内状态
- 第一阶段增量 `upsert/remove`

原因是：

- 当前目标是先把副作用入口收口
- 不是先追求最优刷新效率

## 9. 专题拆分与执行顺序

### 9.1 专题 A：权限与访问控制闭环

范围：

- `GET /api/console/models/:id` 权限修复
- runtime data 面接入 `state_data` ACL
- `state_model` 与 `state_data` 的 `own/all` 规则落地

通过条件：

- 控制面与 runtime 数据面都不再只靠 session 放行
- `state_data.own/all` 有自动化测试覆盖
- root/admin/manager 至少有一组差异化授权回归

### 9.2 专题 B：会话与认证闭环

范围：

- 当前设备退出
- 主动退出全部设备
- 自助改密码
- 管理员重置密码动作统一
- 密码相关动作的全端失效

通过条件：

- `DELETE /api/console/session` 可用
- `POST /api/console/session/actions/revoke-all` 可用
- `POST /api/console/me/actions/change-password` 可用
- 密码变更后旧 session 无法继续通过 `require_session`

### 9.3 专题 C：路由与 OpenAPI 契约收口

范围：

- 动作型路由统一
- OpenAPI 补齐
- OpenAPI 组织方式模块化

通过条件：

- 旧动作路径不再作为正式路径保留
- `/openapi.json` 与实际已暴露路由一致
- runtime team 路由进入 OpenAPI

### 9.4 专题 D：状态入口与 registry 收口

范围：

- `runtime registry` 刷新从 route 挪到应用层
- 数据建模定义变更副作用统一收口

通过条件：

- route 不再显式调用 registry 刷新 helper
- 应用层对模型与字段的 create/update/delete 都能正确触发刷新
- 现有 model/runtime 路由测试继续通过

## 10. 验证要求

### 10.1 后端验证基线

后续每个专题计划至少应包含：

- focused tests
- 对应专题 crate 的 targeted `cargo test -p api-server`、`cargo test -p control-plane`、`cargo test -p runtime-core` 或 `cargo test -p storage-pg`
- `node scripts/node/verify-backend.js`

### 10.2 必须补的关键回归

后续计划必须覆盖以下回归类型：

- 没有对应权限时访问控制面模型定义失败
- `own` 与 `all` 的 runtime record 权限差异成立
- 修改密码后旧 session 失效
- `revoke-all` 后其他设备 session 失效
- 旧动作路径迁移后 OpenAPI 仍与真实路由一致

## 11. 明确不做的项

以下内容即使未来会做，也不进入本轮多个修复计划：

- forgot password
- reset token
- password policy
- password history
- password expiration
- account lockout
- app 级独立角色系统
- `app runtime` 正式交付
- 动态生成每个 model 的独立权限定义
- 动态生成每个 model 的精细 OpenAPI schema

## 12. 当前设计结论

本轮后端修复的目标不是继续扩写平台蓝图，而是把当前已经落地的后端能力拉回到一致、可信、可继续扩展的状态。

当前正式结论固定为：

- `state_model` 作为共享结构资源处理，不按创建人做 `own`
- `state_data` 第一阶段按 `created_by` 落地 `own`
- 密码与 session 安全闭环采用 `session_version`
- 单设备退出与全端失效分开
- 动作路由统一进入 `/actions/*`
- team runtime 是当前交付重点
- `app runtime` 只做结构预留
- OpenAPI 必须重新成为真实契约
- `runtime registry` 刷新入口必须从 route 收回应用层

后续多个修复计划必须全部以本文档为直接设计依据，不再单独发明新的权限、session 或 runtime 路由口径。
