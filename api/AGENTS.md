# Scope
- 作用域：`api/` 及其子目录。
- 下述路径默认相对 `api/`。

## Skills
- 做后端实现、接口、状态流转、分层边界时：使用 `backend-development`
- 做质量评估、回归审计时：使用 `qa-evaluation`

## Directory Rules
- `apps/api-server` 是控制面 HTTP API 宿主；只承载 `route`、`middleware`、`response`、`openapi` 与应用组装。
- `apps/plugin-runner` 是插件运行宿主；不承载控制面业务逻辑。
- `crates/control-plane` 放业务 `service`、状态写入口、审计入口、`repository trait`。
- `crates/orchestration-runtime` 放编排编译、绑定运行时、执行引擎、预览执行器。
- `crates/domain` 放领域模型、作用域语义、稳定核心对象。
- `crates/access-control` 放权限目录、内建角色、权限校验。
- `crates/runtime-core` 放 runtime registry 与 runtime CRUD 核心。
- `crates/runtime-profile` 放运行目标、locale、profile fingerprint 与插件运行环境快照。
- `crates/plugin-framework` 放插件消费类型、绑定约束、插件边界。
- `crates/storage-durable` 放平台主存储边界、主存储启动入口与健康检查入口；只暴露宿主消费的稳定入口。
- `crates/storage-postgres` 放 PostgreSQL `repository impl`、查询、事务、`migrations`、存储层 `mapper`。
- `crates/storage-ephemeral` 放非持久 session store、短期协同原语与可选 backend 适配。
- `crates/storage-object` 放业务文件对象存储 driver 边界；内建 `local` 与 `rustfs` driver。
- `crates/publish-gateway` 是发布网关边界。
- `crates/observability` 放日志、trace 与可观测性基础能力。
- `target` 是构建产物目录，不手工修改。
- 模块级与单元测试统一放到对应 `src/_tests`。
- 应用宿主级健康检查、启动冒烟、跨 crate 集成验证可放到 `tests/`。
- 同一目录下文件数量接近 `15` 个时先收纳子目录；单文件接近 `1500` 行时先拆职责。

## Local Rules
- `apps/api-server/src/routes` 只做协议层：参数解析、上下文提取、调用 service、响应与错误映射、OpenAPI 暴露。
- `apps/api-server/src/middleware` 只做请求链路约束，不写业务状态变更。
- `crates/control-plane/src/*` 是业务边界；关键写动作只能从命名明确的 `service command` 进入。
- `crates/control-plane/src/ports/` 统一定义 `repository trait` 与外部端口。
- `crates/storage-postgres/src/**/*_repository.rs`、`crates/storage-ephemeral/src/*` 只实现存储或短期协同端口，不承载 HTTP 语义。
- actor / scope 过滤型查询属于持久化查询职责；状态流转、权限决策、审计写入属于 `control-plane`。
- `crates/storage-postgres/src/mappers` 只做存储模型与领域模型转换，不承载业务规则。
- 主仓 durable 后端官方只支持 PostgreSQL；不要把额外 durable backend 塞进主存储边界。
- 业务文件二进制走 `storage-object`；插件安装包和业务文件禁止复用 `api/plugins` 存储目录。
- 默认本地业务文件根目录固定为 `api/storage`；`rustfs` driver 内建但不默认启用。
- `file_storages` 是 `root/system` 资源；`workspace` 可创建和消费可见 `file_tables`，存储配置与文件表存储绑定只允许 `root/system` 管理。
- 文件记录必须保存实际 `storage_id`；文件表改绑只影响后续新上传，不迁移旧记录。
- session 必须显式持有 `tenant_id` 与 `current_workspace_id`。
- 单个请求链路只允许落在一个显式 `workspace` 上下文。
- `root/system` 与业务 `workspace` 严格分离。
- 外部接口与业务语义统一使用 `workspace`。
- 登录结果、session 读取与请求中间件必须继续向下传递 `current_workspace_id`。
- 数据建模定义的 `scope_kind` 只允许 `workspace` 与 `system`；`system` 固定使用 `SYSTEM_SCOPE_ID`。
- runtime 物理 scope 列统一使用 `scope_id`；活跃后端代码中不再保留 `team/app` alias、`team_id` 或 `app_id` 语义。
- 成员、角色、权限、模型、会话等关键动作必须写审计日志。
- 会影响 session 安全边界的写动作必须经过显式 service。
- 需要 CSRF 保护的写接口必须校验 `x-csrf-token`。
- `runtime extension` 与 `capability plugin` 禁止注册 HTTP 接口。
- 插件能力只能挂到宿主白名单槽位。
- system 插件只允许 host 安装。
- workspace / tenant 只允许配置、绑定或消费宿主已安装能力。
- `runtime extension` 的绑定目标只能是 `workspace` 或 `model`。
- runtime 模型或字段对应物理表/列缺失时，必须标记不可用；不健康元数据不得继续进入 runtime registry。
- 外部数据库、SaaS、API 数据源统一走 `data-source` runtime extension，不塞进 `storage-durable`。
- data-source plugin 禁止注册 HTTP 接口，禁止直接写平台数据库，禁止自管 OAuth callback。

## Verification
- 进入自检、验收、回归或交付阶段时，使用 `qa-evaluation` 并自行执行对应脚本。
- 新增后端功能的 QA 结论必须覆盖 service 测试与 route 测试。
- 同一工作区内 `cargo` 验证命令默认串行执行，不并发抢锁。
- 修改 `storage-postgres/migrations` 下历史 migration 文件后，数据库测试优先使用独立 schema，避免 `sqlx` migration checksum 污染共享 schema。

## 新增资源最低模板
- 新增关键写资源至少包含：
  - `apps/api-server/src/routes/<resource>.rs`
  - `crates/control-plane/src/<resource>.rs` 或 `crates/control-plane/src/<resource>/mod.rs`
  - `crates/control-plane/src/ports/<resource>.rs` 中对应的 `repository trait`
  - `crates/storage-postgres/src/<resource>_repository.rs` 或 `crates/storage-ephemeral/src/<resource>_repository.rs`
  - 对应 `_tests`
- `dto` 可定义在 route 模块内，不为凑结构拆空文件。
- 只有存在存储层结构转换时才新增 `mapper`。
- `storage-postgres/migrations` 只放数据库迁移。
