# 1Flowse 后端接口内核与扩展边界设计稿

日期：2026-04-12
状态：已完成当前轮设计确认，待用户审阅
关联文档：
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)
- [2026-04-12-auth-team-access-control-backend-design.md](./2026-04-12-auth-team-access-control-backend-design.md)
- [modules/01-user-auth-and-team/README.md](./modules/01-user-auth-and-team/README.md)
- [modules/02-access-control/README.md](./modules/02-access-control/README.md)

## 1. 文档目标

本文档用于把当前已经讨论过的后端范围整理成一版统一的接口版设计，覆盖以下主题：

- 宿主后端的接口内核应该如何组织
- 认证、团队、成员、角色、权限、动态建模、runtime 数据如何进入同一套规则
- 插件扩展、工作区级 runtime extension、执行类 capability plugin 分别能做什么、不能做什么
- 哪些能力可以扩展，哪些能力必须永远由宿主托管

本文档只覆盖当前已讨论域：

- `public auth`
- `control plane`
- `dynamic modeling`
- `runtime data`
- `host-only extension`

本文档不覆盖：

- 文件中心、通知、任务调度、对外集成市场等尚未展开讨论的未来域
- 前端页面结构和交互细节
- 多租户商业化方案

## 2. 设计结论

### 2.1 总体结论

1Flowse 后端正式采用：

`宿主托管的 resource kernel + RESTful 外部接口 + host-only extension`

含义如下：

- 外部 API 继续保持 RESTful 路径，不采用 `resource:action` 风格 URL。
- 内部统一用 `resource / action / provider / registry` 描述系统能力。
- `core` 与 `host-extension` 才拥有系统接口扩展权。
- `runtime extension` 与 `capability plugin` 都不拥有接口注册权，也不拥有接口扩展权。

### 2.2 三个业务面

后端按业务语义固定拆成三个平面：

- `public plane`
  - 面向登录启动、第三方 callback、少量公开协议入口
- `control plane`
  - 面向用户、团队、成员、角色、权限、动态建模定义等宿主管理资源
- `runtime plane`
  - 面向已发布模型的数据记录、运行时查询与宿主定义的动作入口

除此之外，不再引入“第四套公开接口面”给插件自由扩展。

### 2.3 扩展边界结论

- `host-extension`
  - 可以在宿主审批和白名单约束下扩展系统接口
- `runtime extension`（原 `tenant-runtime`）
  - 不能注册 HTTP 接口
  - 不能扩展 HTTP 接口
  - 只能实现宿主预定义的运行时能力槽位
- `capability plugin`（原 `runner/plugin`）
  - 不能注册 HTTP 接口
  - 不能扩展 HTTP 接口
  - 只能实现宿主预定义的业务执行接口

二者都可能以插件包形态交付，差别不在“是不是插件”，而在宿主如何消费：

- `runtime extension`
  - 绑定在模型或应用的 runtime 行为链上
- `capability plugin`
  - 绑定在节点、数据源、发布或 provider 这类执行与集成链上

也就是说，`runtime extension` 和 `capability plugin` 都不是“接口扩展系统”，而是“宿主内部能力实现者”。

## 3. 接口所有权模型

### 3.1 对外接口所有权

所有对外 HTTP 契约都必须归宿主内核所有，插件或租户侧逻辑不得拥有自己的 API contract。

宿主负责统一托管：

- 路径命名
- 鉴权方式
- ACL 接入
- 租户边界
- 审计
- 限流
- OpenAPI 暴露
- 成功/失败响应包装

### 3.2 内部能力所有权

扩展只允许发生在宿主定义好的内部调用链里，不能绕过宿主生成新的外部协议。

因此区分两类东西：

- `external contract`
  - 对外 URL、请求体、响应体、权限语义
  - 永远由宿主定义
- `internal capability`
  - 宿主内部调用的能力槽位
  - 可以由受控扩展实现

## 4. Resource Kernel

### 4.1 Resource 定义

`resource` 不是 CRUD 表别名，而是一个可声明路径、动作、ACL、审计、OpenAPI、扩展点的能力对象。

resource 类型固定为：

- `static`
  - 固定宿主资源，例如 `members`、`roles`、`teams`
- `model-definition`
  - 动态建模元数据资源，例如 `models`、`fields`、`relations`
- `runtime-model`
  - 已发布模型对应的运行时记录资源
- `virtual`
  - 非表驱动的虚拟资源，例如 `auth`、`session`
- `plugin`
  - 仅允许 `host-extension` 声明的宿主级扩展资源

### 4.2 Action 定义

action 统一分三类：

- `crud`
  - `list/get/create/update/delete`
- `command`
  - `disable/reset-password/publish/approve` 这类状态动作
- `protocol`
  - callback、webhook、流式协议这类非标准交互

外部 API 仍使用 RESTful 路径承载这些 action，不把 action 直接编码进 URL 语法。

### 4.3 Descriptor 最小字段

每个可注册的 resource 或 action 至少声明：

- `code`
- `plane`
- `base_path`
- `exposure`
- `tenant_scope`
- `trust_level`
- `acl_namespace`
- `audit_namespace`
- `auth_policy`
- `audit_policy`
- `data_access`

如果缺少上述关键字段，则默认拒绝注册。

## 5. 注册中心与信任边界

### 5.1 注册中心

系统保留三类注册中心：

- `ResourceRegistry`
  - 注册 resource、resource action、ACL namespace、OpenAPI 元数据、宿主级 hook
- `AuthProviderRegistry`
  - 注册认证 provider、启动逻辑、callback 处理逻辑、身份映射逻辑
- `RawRouteRegistry`
  - 注册极少量无法被 resource/action 正常表达的宿主级 callback 或 webhook

### 5.2 权限分级

- `ResourceRegistry`
  - 只允许 `core`、`host-extension`
- `AuthProviderRegistry`
  - 只允许 `core`、`host-extension`
- `RawRouteRegistry`
  - 原则上只允许 `core`
  - `host-extension` 仅在审批和白名单通过后允许注册

`runtime extension` 与 `capability plugin` 不进入这三类注册中心。

### 5.3 默认拒绝

系统扩展默认采用“默认拒绝，显式开放”：

- 默认不公开
- 默认不进入 OpenAPI
- 默认不允许匿名
- 默认不允许跨租户
- 默认不允许访问宿主敏感资源

只有显式声明并通过宿主校验后，能力才可启用。

### 5.4 六条安全铁律

1. 插件不能直接拿到底层数据库连接，只能拿 capability port。
2. 插件不能直接把 handler 塞进主 router，只能提交 descriptor 给宿主 registry。
3. registry 统一挂租户解析、认证、ACL、审计、限流和响应包装。
4. raw route 必须走固定命名空间。
5. callback/public route 必须显式标记 `exposure=callback|public`。
6. 所有 `host-extension` 注册的接口都必须带审计和来源标识。

## 6. 接口平面与路由结构

### 6.1 Public Auth API

认证扩展统一走宿主托管路径：

- `GET /api/public/auth/providers`
- `POST /api/public/auth/providers/password-local/sign-in`
- `POST /api/public/auth/providers/:provider/start`
- `GET|POST /api/public/auth/providers/:provider/callback`
- `GET /api/console/session`
- `DELETE /api/console/session`

约束如下：

- 登录入口路径由宿主固定
- provider 只实现认证逻辑，不拥有自定义认证 URL
- callback 默认也由宿主托管
- 只有第三方协议无法纳入宿主 callback 模型时，才允许申请 raw callback

### 6.2 Control Plane API

控制面核心资源包括：

- `me`
- `team`
- `members`
- `roles`
- `permission-definitions`
- `models`
- `fields`
- `relations`
- `validation-rules`
- `model-versions`

推荐接口形态如下：

- `GET /api/console/me`
- `PATCH /api/console/me`
- `POST /api/console/me/actions/change-password`
- `PUT /api/console/me/default-display-role`
- `GET /api/console/team`
- `PATCH /api/console/team`
- `GET /api/console/members`
- `POST /api/console/members`
- `GET /api/console/members/:id`
- `PATCH /api/console/members/:id`
- `POST /api/console/members/:id/actions/disable`
- `POST /api/console/members/:id/actions/enable`
- `POST /api/console/members/:id/actions/reset-password`
- `PUT /api/console/members/:id/roles`
- `GET /api/console/roles`
- `POST /api/console/roles`
- `GET /api/console/roles/:id`
- `PATCH /api/console/roles/:id`
- `DELETE /api/console/roles/:id`
- `PUT /api/console/roles/:id/permissions`
- `GET /api/console/permission-definitions`

### 6.3 Dynamic Modeling API

动态建模仍属于 `control plane`，不是 runtime 数据本身。

推荐接口形态如下：

- `GET /api/console/models`
- `POST /api/console/models`
- `GET /api/console/models/:id`
- `PATCH /api/console/models/:id`
- `DELETE /api/console/models/:id`
- `GET /api/console/models/:id/fields`
- `POST /api/console/models/:id/fields`
- `PATCH /api/console/models/:id/fields/:field_id`
- `DELETE /api/console/models/:id/fields/:field_id`
- `GET /api/console/models/:id/relations`
- `POST /api/console/models/:id/relations`
- `PATCH /api/console/models/:id/relations/:relation_id`
- `DELETE /api/console/models/:id/relations/:relation_id`
- `GET /api/console/models/:id/validation-rules`
- `POST /api/console/models/:id/validation-rules`
- `PATCH /api/console/models/:id/validation-rules/:rule_id`
- `DELETE /api/console/models/:id/validation-rules/:rule_id`
- `GET /api/console/models/:id/versions`
- `POST /api/console/models/:id/actions/publish`

发布成功后，宿主自动向 `ResourceRegistry` 注入对应的 `runtime-model resource`。

### 6.4 Runtime Data API

运行时数据统一走宿主定义的 runtime 资源路径：

- `GET /api/runtime/models/:model_code/records`
- `POST /api/runtime/models/:model_code/records`
- `GET /api/runtime/models/:model_code/records/:id`
- `PATCH /api/runtime/models/:model_code/records/:id`
- `DELETE /api/runtime/models/:model_code/records/:id`
- `POST /api/runtime/models/:model_code/records/:id/actions/:action_code`

这组路径的含义是：

- 外部 action endpoint 仍由宿主定义
- `action_code` 只表示宿主已登记的运行时动作
- 租户侧和业务插件不能借 `action_code` 直接创造新的公开接口契约

### 6.5 Raw Route 兜底规则

只有以下场景允许考虑 raw route：

- OAuth 特殊 callback
- 第三方 webhook
- 无法用标准 request/response 表达的流式协议

固定命名空间如下：

- `/api/ext/host/:plugin/...`

raw route 不作为主扩展路径，只作为受控兜底。

## 7. Runtime Extension 与 Capability Plugin 白名单

### 7.1 为什么要白名单

如果 `runtime extension` 或 `capability plugin` 还能自由发明新的扩展点，本质上仍然是在变相扩接口。

因此这里不采用“插件自由声明扩展点”，而是采用“宿主固定槽位白名单”。

### 7.2 Runtime Extension 允许的能力槽位

`runtime extension` 只允许实现以下宿主预定义槽位：

- `runtime.query.scope_resolver`
  - 为运行时记录查询补充范围条件
- `runtime.record.validator`
  - 在新增或更新记录前做业务校验
- `runtime.field.default_value`
  - 为字段计算默认值
- `runtime.field.computed_value`
  - 为字段计算派生值、展示值或只读值

这些槽位都必须由宿主在既有调用链里触发，`runtime extension` 不拥有对外 URL。

### 7.3 Capability Plugin 允许的能力槽位

`capability plugin` 只允许实现以下宿主预定义槽位：

- `runner.node.execute`
  - 节点执行器
- `runner.datasource.read`
  - 外部数据读取器
- `runner.datasource.schema`
  - 外部数据结构或元信息读取器
- `runner.publish.render`
  - 发布物渲染器
- `runner.publish.deliver`
  - 发布投递适配器

这些能力由宿主调度执行，不直接暴露成 HTTP 接口。

### 7.4 两类扩展的功能例子

- `runtime extension`
  - 订单模型查询时自动附加“只看自己部门”的过滤范围
  - 创建 `ticket` 记录时自动补 `creator_id` 和默认状态
  - 更新合同记录前校验审批人、金额区间和状态流转是否合法
  - 计算 `risk_level`、`display_name` 这类派生字段
- `capability plugin`
  - 新增一个飞书通知节点执行器
  - 新增一个 MySQL 数据源读取器与 schema 读取器
  - 新增一个 webhook 发布投递器
  - 新增一个模型供应商 provider 供编排节点调用

### 7.5 三个术语的正式含义

- `hook`
  - 宿主已有流程上的固定插槽，不是新接口
- `policy`
  - 宿主内部调用的判定函数，只返回是否允许以及允许范围
- `internal handler`
  - 宿主内部约定好的能力实现，由宿主代码调用，不对外暴露 URL

这三类都属于内部能力，不属于公开接口。

### 7.6 安装、启用、分配、绑定、使用

P1 当前只有一个一等空间对象：

- `Team Workspace`

`Tenant` 仍然只是预留字段，不进入当前插件治理边界。

因此，当前版本的治理链固定为：

1. `install`
   - `root/admin` 在当前 `Team Workspace` 安装插件
2. `enable`
   - 宿主校验来源、`manifest/schema`、兼容性后启用
   - 风险来源代码插件仍需 `root/admin` 二次确认
3. `assign`
   - `root` 可把团队已安装插件分配给指定应用，或设为团队可用
4. `bind`
   - `runtime extension` 需要绑定到具体模型或应用的 runtime 配置后才生效
   - `capability plugin` 需要在节点、数据源、发布配置或 provider 配置中被显式选择后才生效
5. `use`
   - 最终是否能配置或触发，仍受应用、模型、发布等业务权限控制

其中：

- `host-extension`
  - 属于宿主级能力，不进入普通团队的安装分配链
- `runtime extension`
  - 不是“团队装上就全员自动可用”，而是“绑定到具体模型或应用后才生效”
- `capability plugin`
  - 不是“团队装上就所有应用自动启用”，而是“被某个应用显式选择后才参与执行”

### 7.7 明确不开放的能力

以下能力一律不开放给 `runtime extension` 和 `capability plugin`：

- `http.route.register`
- `resource.register`
- `auth.provider.register`
- `raw_route.register`
- `openapi.register`
- `system.user_role_auth.access`
- `session.cookie.control`
- `db.pool.direct_access`

### 7.8 最终边界

- `runtime extension`
  - 不是接口扩展系统
- `capability plugin`
  - 不是接口扩展系统
- 二者都只是宿主预定义能力的实现者
- 二者的差别在于宿主消费方式，不在于是否采用插件包交付

## 8. 权限、响应与审计

### 8.1 权限编码

权限点统一使用：

- `resource.action.scope`

鉴权顺序统一为：

- `session`
- `route exposure`
- `resource permission`
- `data scope`
- `policy hook`

### 8.2 成功响应

统一结构：

```json
{
  "data": {},
  "meta": null
}
```

列表结构：

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "page_size": 20,
    "total": 100
  }
}
```

纯动作成功统一返回：

- `204 No Content`

### 8.3 错误响应

统一结构：

```json
{
  "code": "validation_failed",
  "message": "request validation failed",
  "details": {
    "field": "email"
  }
}
```

### 8.4 审计最小范围

至少覆盖以下动作：

- 登录与退出
- 会话失效
- 成员创建、禁用、启用、重置密码
- 角色创建、修改、删除
- 权限绑定变更
- 模型发布
- runtime command action
- public callback
- host-extension 注册的公开接口调用

## 9. 实施优先级

第一阶段：

- 固定 `public/control/runtime` 三个平面
- 固定统一响应包装和错误结构
- 固定认证入口和 session 路径
- 固定 `runtime extension / capability plugin` 的禁止接口扩展边界

第二阶段：

- 落 `ResourceRegistry / AuthProviderRegistry / RawRouteRegistry`
- 落 control plane 的静态资源路由和权限编码
- 落动态模型发布后自动注入 runtime resource

第三阶段：

- 落宿主定义的 runtime 能力白名单
- 落宿主调度 `runtime extension / capability plugin` 的 capability port
- 按需开放少量审核通过的 `host-extension`

## 10. 明确结论

1Flowse 的后端不是“CRUD 系统加插件补丁”，而是：

- 第一方静态资源用显式分层实现
- 动态模型发布后生成 runtime resource
- 认证扩展只走 hosted provider
- 系统接口扩展只开放给 `core / host-extension`
- `runtime extension / capability plugin` 只允许实现宿主白名单能力，不拥有任何 HTTP 契约

这条边界在当前版本中视为硬约束，不作为可选建议。
