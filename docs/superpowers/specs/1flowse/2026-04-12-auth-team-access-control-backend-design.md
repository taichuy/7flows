# 1Flowse P1 用户认证、团队与权限后端设计稿

日期：2026-04-12
状态：已完成设计确认，待用户审阅
关联模块：
- [01 用户登录与团队接入](./modules/01-user-auth-and-team/README.md)
- [02 权限与资源授权](./modules/02-access-control/README.md)
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)

## 1. 文档目标

本文档用于把模块 `01 用户登录与团队接入` 与模块 `02 权限与资源授权` 在后端的首轮落地方案一次性收敛为可执行设计。

本设计聚焦：
- 控制台认证、会话与 CSRF
- 初始化团队、默认 `root` 用户与内置角色模板
- 成员管理、个人资料、团队基础配置
- 角色 CRUD、权限目录与角色权限绑定
- 最小审计链路

本设计不覆盖：
- 工作台、应用、Flow、发布、状态模型等业务资源的具体服务实现
- 前端页面结构与交互细节
- 多团队、多租户和个人空间

## 2. 设计结论

### 2.1 范围结论

- 本轮后端落地同时覆盖模块 `01` 与模块 `02`。
- 不只做认证和成员接口，还要一并完成角色 CRUD、权限目录查询、角色权限绑定接口。
- 权限目录按当前已确认资源边界一次性种全，而不是只种当前接口最小子集。

### 2.2 核心约束

- P1 控制台认证正式采用 `服务端 Session + HttpOnly Cookie + CSRF`。
- P1 只有一个初始化生成的 `Team Workspace`，但数据库表结构保留未来扩展能力，不把“单团队”写死在模式里。
- 应用级 `root` 是唯一超管，默认权限全开，不可删除、不可禁用、不可编辑其角色模板。
- 空间级内置角色模板为 `admin`、`manager`，二者允许后续编辑权限点。
- 成员默认通过后台创建，不开放自助注册、邀请链接、自助密码找回。
- P1 登录主标识为 `account`；`email` 默认启用为可直接登录的附加标识；`phone` 为非必填且默认不启用登录。
- 普通成员后台被重置密码后，不强制首次登录改密。
- 允许多端登录；禁用账号、管理员重置密码、用户自行修改密码都会让该用户全部会话失效。
- `root` 默认以 `root` 视角进入，同时允许把默认展示角色切到 `admin/manager` 做前端裁剪测试；后端真实权限判定始终以 `root` 放行为准。

## 3. 模块边界

### 3.1 总体切分

后端按 Rust workspace 的既有方向，采用“模块化单体 + 垂直切片”实现：

- `apps/api-server`
  - 承接 `HTTP Router`、Cookie/CSRF/session 中间件、OpenAPI 暴露、启动期 migration 与 bootstrap
- `crates/domain`
  - 承接核心实体、状态枚举、DTO 与显式业务约束对象
- `crates/control-plane`
  - 承接认证、团队、成员、角色、个人资料、审计等控制面服务
- `crates/access-control`
  - 承接权限目录、内置角色模板、权限并集计算与鉴权入口
- `crates/storage-pg`
  - 承接 PostgreSQL migration 与 repository 实现
- `crates/storage-redis`
  - 承接 session、csrf token、session 失效相关存取能力

### 3.2 边界原则

- 领域层回答“当前动作是否合法”。
- 服务层回答“谁能执行、执行时要改哪些状态、需要写哪些审计”。
- 仓储层只负责持久化，不隐式附带状态跳转。
- HTTP 层只负责鉴权上下文、参数解析和响应映射，不直接写业务规则。

## 4. 数据模型

## 4.1 基类字段约定

所有控制面主表统一继承基类字段：

- `id`
- `introduction`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

实现约定：
- `id` 使用 `UUIDv7`
- `created_by`、`updated_by` 为可空 `UUID`，用于表达系统 bootstrap 场景
- 时间统一使用 `timestamptz`

### 4.2 用户表 `users`

字段：
- `id`
- `account`
- `email`
- `phone`
- `password_hash`
- `name`
- `nickname`
- `avatar_url`
- `introduction`
- `default_display_role`
- `email_login_enabled`
- `phone_login_enabled`
- `status`
- `session_version`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- `account` 必填且全局唯一
- `email` 全局唯一
- `phone` 可空，非空时全局唯一
- `status` 仅支持 `active`、`disabled`
- `email_login_enabled` 默认 `true`
- `phone_login_enabled` 默认 `false`
- `session_version` 默认 `1`，用于全量会话失效
- `default_display_role` 存角色代码字符串，不做外键
- 登录请求统一使用 `identifier + password`；`identifier` 可命中 `account`，也可命中被启用的 `email/phone`
- 开启为登录标识的 `account/email/phone` 归一化后不得与其他用户的任一已启用登录标识冲突
- `root` 账号允许修改 `nickname/avatar_url/introduction`

### 4.3 团队表 `teams`

字段：
- `id`
- `name`
- `logo_url`
- `introduction`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- P1 启动 bootstrap 只创建一个初始化团队
- 表结构不强制单例，为后续多空间预留

### 4.4 成员关系表 `team_memberships`

字段：
- `id`
- `team_id`
- `user_id`
- `introduction`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- `(team_id, user_id)` 唯一
- 成员列表基于该表与 `users` 联查
- `root` 在初始化团队中也拥有 membership

### 4.5 角色表 `roles`

字段：
- `id`
- `scope_kind`
- `team_id`
- `code`
- `name`
- `introduction`
- `is_builtin`
- `is_editable`
- `system_kind`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- `scope_kind` 仅支持 `app`、`team`
- `root` 角色为应用级，`team_id` 为空
- `admin`、`manager` 为团队级，属于初始化团队
- `code` 在同一作用域内唯一
- `root` 满足 `is_builtin=true`、`is_editable=false`、`system_kind=root`
- `admin/manager` 满足 `is_builtin=true`
- 自定义角色仅允许 `scope_kind=team`

### 4.6 权限目录表 `permission_definitions`

字段：
- `id`
- `resource`
- `action`
- `scope`
- `code`
- `name`
- `introduction`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

命名规则：
- 权限点统一采用 `resource.action.scope`

资源目录：
- `application`
- `flow`
- `publish_endpoint`
- `route_page`
- `state_model`
- `state_data`
- `external_data_source`
- `plugin_config`
- `embedded_app`
- `user`
- `role_permission`
- `team`

动作目录：
- `view`
- `create`
- `edit`
- `delete`
- `manage`
- `publish`
- `use`
- `configure`

范围规则：
- 数据范围统一只支持 `own`、`all`
- 不适用 `own` 的权限点只生成 `.all`

### 4.7 角色权限关系表 `role_permissions`

字段：
- `id`
- `role_id`
- `permission_id`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- `(role_id, permission_id)` 唯一
- `root` 的全权限不依赖逐条维护，鉴权时直接短路放行；表中可不存 `root` 的全量绑定

### 4.8 用户角色关系表 `user_role_bindings`

字段：
- `id`
- `user_id`
- `role_id`
- `created_by`
- `created_at`
- `updated_by`
- `updated_at`

约束：
- `(user_id, role_id)` 唯一
- 新建成员默认绑定当前团队的 `manager`
- `root` 用户必须始终持有应用级 `root` 角色

### 4.9 审计表 `audit_logs`

字段：
- `id`
- `team_id`
- `actor_user_id`
- `target_type`
- `target_id`
- `event_code`
- `payload`
- `created_at`

本轮最小事件范围：
- `member.created`
- `member.disabled`
- `member.password_reset`
- `member.roles_replaced`
- `team.updated`
- `role.created`
- `role.updated`
- `role.deleted`
- `role.permissions_replaced`

## 5. 状态与关键规则

### 5.1 用户状态

用户状态只收敛为两档：
- `active`
- `disabled`

状态规则：
- `active -> disabled` 允许由具备成员管理权限的 `admin/root` 执行
- `disabled -> active` 本轮不单独提供启用接口，后续如需要再补；本轮可在成员编辑接口中保留内部实现空间，但不对外暴露
- `root` 不允许进入 `disabled`

### 5.2 会话状态

会话以 Redis 记录，服务端状态至少包含：
- `session_id`
- `user_id`
- `team_id`
- `issued_at`
- `expires_at`
- `session_version`
- `csrf_token`

会话规则：
- 登录成功创建新 session
- 每次有效访问做 7 天滑动续期
- 校验时同时验证 `session_version == users.session_version`
- 版本不一致即视为失效

### 5.3 角色规则

- `root` 为唯一应用级内置超管角色
- `admin`、`manager` 为初始化团队的空间级内置角色模板
- `root` 不允许删除、编辑、复制、解绑或降级
- `admin`、`manager` 允许修改权限点，但仍保留内置角色身份
- 自定义角色只允许作用于团队级

### 5.4 默认展示角色规则

- `default_display_role` 只影响前端默认视角，不影响后端真实权限集合
- 普通用户只能选择自己已绑定角色
- `root` 可选择 `root/admin/manager` 作为默认展示视角
- 若普通用户的默认展示角色失效，读取个人会话信息时自动回退到其首个有效角色

## 6. Bootstrap 设计

### 6.1 启动顺序

`api-server` 启动时固定执行：

1. 读取环境变量
2. 建立 Postgres / Redis 连接
3. 执行 SQL migrations
4. 幂等 seed 权限目录
5. 幂等创建默认团队
6. 幂等创建内置角色模板 `root/admin/manager`
7. 幂等创建 `.env` 指定的默认 `root` 账号
8. 幂等创建 `root` 的应用级角色绑定与初始化团队 membership

### 6.2 Bootstrap 约束

- 已存在数据不覆盖
- `.env` 后续修改不会自动同步数据库中的 `root` 密码
- `root` 密码兜底通过独立命令完成，例如 `cargo run -p api-server -- reset-root-password`
- Bootstrap 必须可重复执行，不生成第二个初始化团队、第二个 `root` 账号或第二套内置角色

## 7. 认证与安全模型

### 7.1 登录模型

控制台认证采用：
- `POST /api/console/auth/login`
- `POST /api/console/auth/logout`
- `GET /api/console/auth/session`
- `GET /api/console/auth/csrf`

约束：
- 登录方式固定为 `identifier + password`
- `identifier` 解析顺序为：`account` -> 启用中的 `email` -> 启用中的 `phone`
- 不提供自助注册
- 不提供邮箱验证码、第三方登录、自助密码找回

### 7.2 Cookie 策略

- Cookie 仅存放 opaque `session_id`
- `HttpOnly`
- `SameSite=Lax`
- 本地开发默认不强制 `Secure`
- 生产环境启用 `Secure`

### 7.3 CSRF 策略

- 每个 session 绑定一个 `csrf_token`
- 前端通过 `GET /api/console/auth/csrf` 获取 token
- 所有变更类请求必须携带 `X-CSRF-Token`
- CSRF token 与 session 一起失效

### 7.4 密码策略

- 密码哈希统一使用 `argon2`
- 管理员重置密码时直接写入新哈希
- 本轮不引入“临时密码首次登录必须改密”状态
- 用户自己修改密码成功后，立即递增 `session_version`，全部会话失效，后续需重新登录
- 管理员重置密码、禁用账号时，同样递增 `session_version`

## 8. 鉴权模型

### 8.1 判定顺序

后端统一按以下顺序判定：

1. 用户是否持有应用级 `root`
2. 若不是 `root`，则读取当前团队内用户已绑定角色
3. 对这些角色的权限点做并集
4. 再对具体资源数据范围执行 `own/all` 判断

### 8.2 当前团队

P1 当前只有一个初始化团队，因此控制台 session 中直接保存当前团队 `team_id`。

后续扩展多团队时：
- session 中的当前团队可切换
- 团队级角色与权限计算逻辑无需重写

### 8.3 路由与资源关系

本轮后端先实现权限点与角色绑定接口，不实现完整资源权限检查。

但鉴权入口与权限编码必须按未来规则设计：
- 页面访问看路由权限
- 按钮与接口操作看动作权限
- 数据读取与修改再叠加 `own/all` 判断

## 9. API 设计

### 9.1 认证接口

- `POST /api/console/auth/login`
  - 输入：`identifier`、`password`
  - 输出：当前用户摘要、团队摘要、默认展示角色、可用角色、CSRF token
- `POST /api/console/auth/logout`
  - 清当前 session
- `GET /api/console/auth/session`
  - 返回当前会话上下文
- `GET /api/console/auth/csrf`
  - 返回当前 session 的 CSRF token

### 9.2 个人接口

- `GET /api/console/me`
- `PATCH /api/console/me/profile`
  - 允许修改：`name`、`nickname`、`avatar_url`、`introduction`、`phone`
- `POST /api/console/me/change-password`
- `PATCH /api/console/me/default-display-role`

约束：
- 普通用户不能通过个人接口改自己角色、权限、状态
- `account`、`email` 不允许在个人接口中修改
- `phone_login_enabled`、`email_login_enabled` 不在个人接口中开放

### 9.3 团队接口

- `GET /api/console/team`
- `PATCH /api/console/team`

允许修改：
- `name`
- `logo_url`
- `introduction`

### 9.4 成员接口

- `GET /api/console/members`
- `POST /api/console/members`
- `PATCH /api/console/members/:id`
- `POST /api/console/members/:id/disable`
- `POST /api/console/members/:id/reset-password`
- `PUT /api/console/members/:id/roles`

约束：
- 创建成员需显式传 `account`、`email`、初始密码
- 创建或编辑成员时可显式配置 `email_login_enabled`、`phone_login_enabled`
- 创建成员默认绑定 `manager`
- `PUT /members/:id/roles` 采用全量替换，避免角色增删多入口写同一状态
- `root` 不允许被禁用、不允许被移除全部角色

### 9.5 角色接口

- `GET /api/console/roles`
- `POST /api/console/roles`
- `PATCH /api/console/roles/:id`
- `DELETE /api/console/roles/:id`
- `GET /api/console/roles/:id/permissions`
- `PUT /api/console/roles/:id/permissions`
- `GET /api/console/permissions`

约束：
- 只允许创建团队级自定义角色
- `root` 角色不可编辑、不可删除、不可绑定新权限点
- `admin/manager` 允许修改权限点
- 删除角色前必须检查是否仍被用户绑定；若被绑定则拒绝删除

## 10. 服务设计

### 10.1 `bootstrap_service`

负责：
- 迁移后初始化权限目录
- 创建默认团队
- 创建内置角色模板
- 创建默认 `root`
- 修补缺失的绑定关系

### 10.2 `auth_service`

负责：
- 登录认证
- 密码校验
- session 创建/销毁
- CSRF token 读取
- 当前 session 上下文解析

### 10.3 `profile_service`

负责：
- 查询当前用户摘要
- 修改个人资料
- 修改个人密码
- 修改默认展示角色
- 默认展示角色回退逻辑

### 10.4 `team_service`

负责：
- 查询初始化团队信息
- 更新团队基础配置
- 写入团队变更审计

### 10.5 `member_service`

负责：
- 成员列表
- 创建成员
- 编辑成员基础资料
- 禁用成员
- 重置密码
- 替换成员角色绑定
- 写入成员相关审计

### 10.6 `role_service`

负责：
- 查询角色
- 创建团队自定义角色
- 编辑角色元数据
- 删除角色
- 查询角色权限
- 替换角色权限
- 校验内置角色与 `root` 保护规则

## 11. 审计设计

### 11.1 设计原则

- 审计采用服务层显式写入
- 不使用数据库 trigger，避免隐藏副作用
- payload 使用结构化 JSON，保留旧值/新值摘要与目标标识

### 11.2 首轮必记事件

- 成员创建
- 成员禁用
- 成员密码重置
- 成员角色全量替换
- 团队配置更新
- 角色创建
- 角色更新
- 角色删除
- 角色权限全量替换

## 12. 测试设计

### 12.1 单元测试

覆盖：
- 权限点编码生成
- `root` 保护规则
- 默认展示角色回退逻辑
- 会话版本失效判定

### 12.2 服务测试

覆盖：
- bootstrap 幂等
- 登录成功/失败
- `account/email/phone` 登录标识解析与启用开关
- 密码修改后会话全部失效
- 成员创建默认绑定 `manager`
- 禁用成员后旧 session 全失效
- 重置密码后旧 session 全失效
- `root` 相关保护规则拒绝非法操作

### 12.3 API 集成测试

覆盖：
- 登录、获取 session、获取 csrf
- 更新个人资料
- 更新团队配置
- 创建成员、替换角色、重置密码、禁用成员
- 创建角色、更新角色、替换权限、删除角色
- 缺失 CSRF 或无权限时返回正确错误码

## 13. 风险与控制

### 13.1 首轮不直接把所有权限检查铺满业务资源

这是刻意留白，而不是遗漏。

原因：
- 当前还没有 `Application/Flow/State Model` 等真实资源服务
- 本轮先把“用户、角色、权限目录、会话、审计”主干打稳
- 后续资源模块只需接入统一鉴权入口与权限点编码

### 13.2 `default_display_role` 不做外键

这是有意设计。

原因：
- 该字段本质是前端默认视角偏好，不是安全边界
- 若直接做外键，角色删除与内置角色视角预览会让状态迁移更复杂
- 读取时做有效性回退即可保证行为可解释

## 14. 实施结果预期

本设计完成后，控制台应具备以下最小可运行闭环：

1. 启动后自动得到初始化团队、默认 `root`、内置角色与完整权限目录。
2. `root` 可通过邮箱密码登录控制台。
3. 控制台使用 Cookie + Session + CSRF 完成认证。
4. `root/admin` 可管理成员、角色与角色权限。
5. 普通成员可修改个人资料、密码与默认展示角色。
6. 关键管理动作都能落最小审计记录。
