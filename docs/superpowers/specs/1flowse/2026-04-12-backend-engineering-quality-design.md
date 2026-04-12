# 1Flowse 后端工程与质量规范

日期：2026-04-12
状态：已完成当前轮设计确认，待用户审阅
关联文档：
- [2026-04-12-backend-interface-kernel-design.md](./2026-04-12-backend-interface-kernel-design.md)
- [2026-04-12-auth-team-access-control-backend-design.md](./2026-04-12-auth-team-access-control-backend-design.md)
- [2026-04-10-p1-architecture.md](./2026-04-10-p1-architecture.md)

## 1. 文档目标

本文档用于把后端实现层面的工程规范和质量门禁收敛成正式标准，补齐接口设计之外的另一半约束。

本文档聚焦以下 7 块：

- 分层边界
- 资源实现模板
- 命名规范
- 一致性规范
- 响应规范
- 测试规范
- 质量门禁

本文档不重复定义：

- 插件与接口扩展的权限边界
- 认证、团队、角色、权限的业务结论
- 未来未讨论业务域的详细 API

## 2. 设计结论

1Flowse 后端工程正式采用以下原则：

- 显式分层，禁止魔法式 BaseCrud 继承体系
- 静态控制面、动态建模面、运行时数据面分开实现
- 业务规则统一收口到 service，不散落到 route 或 repository
- 关键状态只允许从命名明确的 service action 入口修改
- 响应结构、测试要求、验证命令和提交前检查统一标准化

## 3. 分层边界

### 3.1 Route / HTTP

职责：

- 解析路径、查询、请求体
- 提取 `SessionActor`、CSRF、trace 等上下文
- 调用 service
- 把 service 结果映射成 HTTP 响应和 OpenAPI 契约

禁止：

- 写业务规则
- 做权限并集判定
- 直接写 SQL
- 控制事务
- 决定审计策略
- 决定状态流转

### 3.2 Service / Application

职责：

- 作为 command / query 的唯一业务入口
- 承接权限判定、状态变更、幂等规则、事务意图、审计触发
- 定义一个动作需要改哪些聚合、触发哪些外部能力

硬约束：

- 关键状态只能在 service 中修改
- 同一关键状态不能由多个模块随意改写
- route 不得绕过 service 直接调用 repository 完成写操作

### 3.3 Repository / Infrastructure

职责：

- 持久化领域对象或查询投影
- 承接事务内的数据读写
- 封装 PostgreSQL、Redis、对象存储等基础设施细节

禁止：

- 承载 HTTP 语义
- 做权限判断
- 决定状态流转
- 根据业务角色偷偷附带额外写操作

### 3.4 Domain

职责：

- 定义实体、值对象、状态枚举、领域约束对象
- 表达业务不变量和状态合法性

边界：

- 不依赖 HTTP
- 不依赖数据库驱动
- 不依赖具体框架中间件

### 3.5 Mapper

职责：

- 负责数据库行、领域对象、查询投影、响应对象之间的转换

禁止：

- 在 mapper 里做业务判断
- 在 mapper 里隐藏权限逻辑
- 在 mapper 里串联额外查询改变业务含义

### 3.6 Extractor / Middleware / Hook

职责：

- 处理横切问题，例如 actor 提取、CSRF、trace、限流、审计注入、runtime capability 调用

边界：

- extractor 和 middleware 只处理横切能力
- hook 只挂在宿主预定义插槽上，不是业务动作主入口

## 4. 资源实现模板

### 4.1 静态控制面资源

适用资源：

- `members`
- `roles`
- `teams`
- `permission-definitions`
- 其他结构稳定、权限严格、审计要求高的固定资源

实现模板：

- `route`
- `dto`
- `service`
- `repository trait`
- `repository impl`
- `mapper`
- `service tests`

原则：

- 可用 scaffold 生成骨架，但生成后必须是显式普通代码
- 不为节省几份文件去把 route、service、SQL、mapper 混在一起

### 4.2 动态建模资源

适用资源：

- `models`
- `fields`
- `relations`
- `validation-rules`
- `model-versions`

实现模板：

- 显式 route
- 显式 service
- 显式 repository
- 发布动作单独走 command service

原则：

- 动态建模是元数据系统，不是 runtime 数据本身
- 发布模型版本后再生成 runtime resource
- 不直接把建模系统做成“表定义 CRUD + 任意副作用”

### 4.3 Runtime Engine

适用对象：

- 已发布模型的记录 CRUD
- runtime action
- capability slot 调用

实现模板：

- `engine`
- `metadata`
- `validators`
- `actions`
- `hooks`
- `policies`
- `query scope`

原则：

- runtime data 走统一引擎，不为每个动态模型单独手写 controller/service/repository
- action endpoint 由宿主统一定义，内部再分派给已登记动作
- `runtime extension` 只能挂到宿主白名单槽位

### 4.4 不采用继承式 BaseCrud

以下抽象不作为正式方向：

- `BaseCrudController<T>`
- `BaseCrudService<T>`
- `BaseMapper<T>`

原因：

- Rust 不适合深继承式抽象
- 会让业务入口和状态边界变得模糊
- 会增加 AI 和人工协作时的理解成本

## 5. 命名规范

### 5.1 DTO

- `CreateXxxBody`
- `UpdateXxxBody`
- `ReplaceXxxBody`
- `ListXxxQuery`
- `XxxPath`
- `XxxResponse`

约束：

- request body、path、query 分开命名
- 不用 `Req`、`Resp` 这类信息量低的缩写

### 5.2 Command / Query

- `CreateXxxCommand`
- `UpdateXxxCommand`
- `DisableXxxCommand`
- `ResetXxxPasswordCommand`
- `PublishXxxCommand`
- `GetXxxQuery`
- `ListXxxQuery`

约束：

- 有状态副作用的动作必须命名成 command
- 纯读取动作命名成 query
- 不用一个 `save()` 模糊承载 create/update/replace/publish 多种语义

### 5.3 Service / Repository / Mapper

- service：`XxxService`
- repository trait：`XxxRepository`
- PostgreSQL 实现：`PgXxxRepository`
- mapper：`PgXxxMapper`

约束：

- trait 和 impl 保持一一对应
- mapper 命名跟随存储实现，不做模糊的 `CommonMapper`

### 5.4 Route 模块

- 资源路由文件按资源代码命名，例如 `members.rs`、`roles.rs`
- 每个资源模块导出 `router()`
- 主入口只做 `nest()` 注册，不堆叠大量 `.route(...)`

## 6. 一致性规范

### 6.1 事务边界

- 事务意图由 service 定义
- route 不得开启或协调业务事务
- repository 不得偷偷自建跨聚合事务掩盖业务边界
- 一个用例需要同时改多个聚合时，由上层 service 统一编排

### 6.2 状态入口

以下动作必须使用显式 action/command 入口，而不是通用 patch：

- `disable`
- `enable`
- `reset-password`
- `publish`
- `activate`
- 其他会触发审计、权限变化、外部副作用或状态机跳转的动作

原则：

- 关键状态一律有名字明确的写入口
- repository 不能成为隐式状态机

### 6.3 幂等

以下场景必须显式考虑幂等：

- 发布动作
- callback 恢复
- 会被重试的后台命令
- 插件安装、启用、激活
- 可能被前端重复点击的关键状态动作

实现要求：

- 优先使用幂等键、唯一约束或自然业务键
- 如果不采用显式幂等键，service 必须用领域状态和持久化约束防止重复副作用

### 6.4 审计

审计决策由 service 触发，至少覆盖：

- 登录、退出、会话失效
- 成员创建、禁用、启用、重置密码
- 角色和权限变更
- 模型发布
- runtime command action
- host-extension 暴露的公开接口调用

### 6.5 权限一致性

- 权限判定统一在 service / policy 收口
- route 只做 actor 提取与入参校验
- repository 不得隐式按用户角色改写查询语义
- query scope 必须走宿主统一的 scope resolver

## 7. 响应规范

### 7.1 成功响应

统一使用轻包装：

```json
{
  "data": {},
  "meta": null
}
```

列表响应：

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

### 7.2 错误响应

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

约束：

- `code` 用稳定的机器可读错误码
- `message` 用简洁说明
- `details` 只放补充结构化上下文

### 7.3 Meta 约束

`meta` 只允许承载通用元信息：

- 分页
- 排序
- 过滤摘要
- cursor
- 版本号

`meta` 不承载业务字段。

## 8. 测试规范

### 8.1 Service Tests

以下场景必须有 service tests：

- 复杂状态动作
- 涉及多聚合写入的用例
- 带审计、副作用、幂等要求的用例

### 8.2 Permission Tests

以下场景必须有 permission tests：

- 成员、角色、权限、团队配置
- 模型发布
- runtime action
- 任何需要区分 `root/admin/manager/user` 的接口

### 8.3 Runtime Hook / Action Tests

以下能力必须逐项测试：

- 每个 runtime hook
- 每个 runtime action
- 每个 query scope resolver
- 每个 computed/default value slot

### 8.4 Repository / Mapping Tests

以下场景建议至少补 targeted tests：

- 复杂 SQL 查询
- JSON 字段映射
- 版本发布与唯一约束
- 容易出现空值或枚举转换错误的 mapper

### 8.5 测试目录约束

- 测试文件统一放到对应子目录下的 `_tests`
- service tests 跟随资源或模块收纳
- runtime engine tests 跟随 `hooks/actions/policies` 收纳

## 9. 质量门禁

### 9.1 文件与目录约束

- 单个代码文件原则上不超过 `1500` 行
- 单个目录下文件原则上不超过 `15` 个
- 超过后必须按责任拆分子目录
- 一个资源一个 route 文件、一个 service 文件、一个 repository 文件
- 禁止一个文件同时混 route、service、SQL、mapper

### 9.2 AI 协作约束

- 优先显式代码，不堆宏黑盒和隐式注册
- 公共横切逻辑进入 extractor、middleware、helper，不复制粘贴
- OpenAPI 注册统一由资源模块导出，不在主入口散写
- 改复杂状态动作时必须先补 service tests

### 9.3 后端改动最小验证命令

发生后端代码改动时，提交前至少执行：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

如果只改动单一 crate，也至少执行：

```bash
cargo test -p <crate-name>
```

并补一次工作区级验证：

```bash
cargo check --workspace
```

### 9.4 提交前检查

提交前必须逐项确认：

- 改动是否遵守 `route / service / repository / domain / mapper` 分层
- 是否新增了对应 tests
- 是否补了权限、幂等、审计考虑
- 是否更新了 OpenAPI 或相关文档
- 是否把测试文件放入 `_tests`
- 是否跑过最小验证命令
- 是否把无关改动混进提交

## 10. 明确结论

1Flowse 的后端工程规范不是“写得能跑就行”，而是：

- 用显式分层守住业务边界
- 用静态资源、动态建模、runtime engine 三套实现模板控制复杂度
- 用统一命名、统一响应、统一测试和统一门禁降低协作成本
- 用事务、状态入口、幂等和审计守住一致性

接口规范定义“系统对外长什么样”，本文定义“后端代码应该怎么写、怎么验、怎么交付”。
