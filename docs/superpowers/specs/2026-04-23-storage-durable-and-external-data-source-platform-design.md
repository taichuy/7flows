# 主存储与外部数据源平台设计

## 背景

当前 `api/crates/storage-pg` 同时承担了两层语义：

1. 平台主存储能力边界
2. PostgreSQL 具体实现

这会导致目录命名、宿主依赖和未来扩展方向混在一起。与此同时，产品已经明确未来要支持外部数据库、`SaaS`、`API` 等数据源接入，但主仓库并不希望从一开始官方维护多种持久化后端。

因此需要把“平台主存储”和“外部数据源平台”拆成两条架构线：

1. 平台主存储：只承载平台自己拥有的数据和状态
2. 外部数据源平台：只承载接入、发现、预览、同步和平台级元数据

这与当前代码现状是兼容的：

1. `control-plane` 已经通过 `ports/*` 定义业务边界
2. `plugin-framework` 已经有 `runtime_extension`、`process_per_call`、`stdio_json` 等插件运行机制
3. `model_provider` 已经验证了“实例 + secret + catalog cache + routing”的平台元数据模式

## 目标

本次设计的目标是：

1. 将主仓库官方 durable backend 收敛为 `PostgreSQL`
2. 把平台主存储边界改成能力名 `storage-durable`
3. 把 PostgreSQL 具体实现改成 `storage-postgres`
4. 为未来外部数据库、`SaaS`、`API` 数据源预留独立平台边界 `data-source-platform`
5. 明确第三方数据源插件的最小实现方式和宿主责任边界

## 非目标

本次设计不做以下内容：

1. 不从现在开始官方维护多种 durable backend
2. 不为所有外部数据源定义统一写回语义
3. 不实现跨源事务
4. 不让 runtime extension 自行注册 HTTP 接口
5. 不在本阶段实现全量 `OAuth`、`webhook`、增量同步平台

## 术语

### 平台主存储

指平台自己拥有 schema、迁移、审计和一致性要求的长期状态存储。比如：

1. 用户、角色、权限
2. workspace、应用、流程
3. 插件安装、宿主扩展、运行时元数据
4. 外部数据源实例本身的配置和接入元数据

### 外部数据源

指平台不拥有物理 schema 的接入目标，包括：

1. 外部数据库
2. `SaaS` 平台对象
3. 第三方 `HTTP API`
4. 未来其他远程资源系统

### 预览读取

指对外部数据源做只读探测、样本拉取或 schema 发现，不直接落入平台主存储。

### 同步导入

指用户显式触发或平台调度触发，将外部数据源的快照或增量数据写入平台主存储中的受控结构。

## 方案选择

本设计采用“平台主存储与外部数据源平台并行分层”的方案。

理由：

1. 主存储和外部数据源在 ownership、migration、回滚、权限、可写语义上都不是同一类问题。
2. 如果把两者继续塞进 `storage-*` 一个抽象里，后续会很快出现能力边界和实现细节混杂。
3. 主仓库只维护 `PostgreSQL` 时，平台主线可以保持简单；而外部数据源通过插件契约开放给后续开发者实现。
4. 这与 NocoBase 的“主库特例 + 多数据源平台化”思路一致，但不照搬它完整的运行时模型。

## 总体架构

### 第一条线：平台主存储

主存储相关 crate 收敛为：

1. `storage-durable`
2. `storage-postgres`

职责划分：

#### `storage-durable`

只负责平台主存储边界，对外提供：

1. 主存储 backend 选择
2. 宿主启动入口
3. migration 执行入口
4. 健康检查入口
5. 面向宿主的稳定组合类型

它不负责：

1. 具体 SQL 查询
2. `PgPool` 暴露
3. 物理 migration 文件

#### `storage-postgres`

只负责 PostgreSQL 具体实现，包含：

1. 连接创建
2. 事务与查询
3. repository impl
4. mapper
5. `sqlx` migrations

主仓库长期只官方维护这一条实现线。

### 第二条线：外部数据源平台

新增独立边界：

1. `data-source-platform`

它不承载外部源的真实驱动实现，只承载平台元数据和运行时编排，例如：

1. 数据源实例定义
2. secret 存储
3. catalog / schema cache
4. preview session
5. import / sync job state
6. workspace 级绑定和配置

真正接外部源的 adapter 不放在主仓库核心主线里，而是走插件扩展口。

## 主仓库官方支持矩阵

主仓库官方支持矩阵固定为：

1. `storage-durable`
2. `storage-postgres`
3. `data-source-platform` 契约和平台元数据层
4. 至少一个示例数据源插件模板

主仓库不承诺：

1. 官方维护多个 durable backend
2. 官方维护所有外部数据库 adapter
3. 官方维护所有 `SaaS/API` adapter

第三方或后续开发者可以在稳定契约上新增：

1. `data-source-postgres`
2. `data-source-mysql`
3. `data-source-salesforce`
4. `data-source-notion`
5. `data-source-hubspot`
6. 其他自定义 adapter

## Durable Storage 设计

### 命名与边界

当前 `storage-pg` 改为：

1. `storage-postgres`

新增：

1. `storage-durable`

宿主以后只依赖 `storage-durable`，不再直接依赖 `storage-postgres` 的实现名。

### 对外 API 形态

`storage-durable` 只提供薄入口，建议至少有：

1. `DurableBackendKind`
2. `MainDurableRuntime`
3. `build_main_durable(config)`
4. `run_main_durable_migrations(runtime)`
5. `check_main_durable_health(runtime)`

### migration 归属

硬规则如下：

1. `storage-durable` 不放任何物理 migration
2. migration 永远归具体 backend 所有
3. 当前只有 `storage-postgres/migrations`

### 未来第二种 durable backend 的处理

如果未来真的出现第二种 durable backend：

1. 先保持 `storage-durable` 不变
2. 再新增 `storage-xxx`
3. 只在出现明确重复时再评估是否抽出更低一层 `storage-relational`

在未出现第二种同类关系型 durable backend 前，不提前抽象 `storage-relational`。

## 外部数据源平台设计

### 设计原则

外部数据源平台从第一天开始就按“平台扩展单元”设计，但契约先收窄，不追求一次到位。

V1 只支持：

1. 接入配置
2. 连接校验
3. 资源发现
4. schema 描述
5. 预览读取
6. 手动导入

V1 不支持：

1. 通用写回
2. 跨源事务
3. 自动增量同步
4. 插件自带 HTTP 回调

### 为什么不定义统一写回接口

外部数据库、`SaaS`、`API` 的写语义差异极大：

1. 有些支持标准 `CRUD`
2. 有些只有批量 upsert
3. 有些只有异步 job
4. 有些完全不允许写

因此平台不应在 V1 里假装它们都属于统一的“可写存储接口”。

## 第三方数据源插件契约

### 插件消费类型

外部数据源插件建议走现有 `runtime_extension` 路线，而不是新增完全不同的宿主机制。

约束如下：

1. `consumption_kind = runtime_extension`
2. `slot_codes` 包含 `data_source`
3. `contract_version = 1flowbase.data_source/v1`
4. `execution_mode = process_per_call`
5. `runtime.protocol = stdio_json`

这允许平台继续复用现有 `plugin-framework` 的安装、artifact 校验、运行时调用和权限模型。

### 最小运行时方法

数据源插件的最小方法集固定为：

1. `validate_config`
2. `test_connection`
3. `discover_catalog`
4. `describe_resource`
5. `preview_read`
6. `import_snapshot`

方法语义：

#### `validate_config`

校验配置字段、鉴权模式和必填项，不实际做重资源访问。

#### `test_connection`

在给定配置和 secret 下验证访问凭证是否有效，返回精简的健康结论。

#### `discover_catalog`

列出该数据源可暴露给平台的资源目录。这里统一使用 `resource` 术语，不提前绑定成 `table`、`collection`、`endpoint` 中的某一种。

#### `describe_resource`

返回某个资源的结构描述，例如字段、类型、分页能力、主键提示、只读/可导入能力。

#### `preview_read`

返回有限条数的预览数据，供 UI 展示和导入映射确认使用。

#### `import_snapshot`

返回一个平台可消费的受控导入输出，交由宿主写入 `storage-durable`。插件本身不直接写平台数据库。

### 插件包建议结构

建议第三方数据源插件最小目录结构如下：

```text
my-data-source-plugin/
  manifest.yaml
  datasource/my_source.yaml
  runtime/main.(js|ts|py|...)
  i18n/en_US.json
```

各部分职责：

1. `manifest.yaml`
   声明消费类型、运行方式、权限和契约版本
2. `datasource/my_source.yaml`
   声明源元信息、能力和配置 schema
3. `runtime/main.*`
   实现平台约定的方法
4. `i18n/*`
   提供 UI 可展示的文案

### 数据源定义文件建议字段

建议至少包含：

1. `source_code`
2. `display_name`
3. `description`
4. `auth_modes`
5. `capabilities`
6. `supports_sync`
7. `supports_webhook`
8. `resource_kinds`
9. `config_schema`

其中 `resource_kinds` 用于声明该 adapter 暴露的资源类型，例如：

1. `table`
2. `object`
3. `endpoint`
4. `report`

平台内部仍统一按 `resource` 处理。

## 插件与宿主的责任边界

### 插件负责

1. 外部协议适配
2. 凭证使用
3. catalog / schema 发现
4. 数据样本读取
5. 导入快照生成

### 宿主负责

1. 插件安装、校验和运行
2. 权限与沙箱
3. secret 存储
4. preview session 存储
5. import / sync job 编排
6. 向 `storage-durable` 落盘

### 插件明确禁止

1. 不跑平台 migration
2. 不直接写平台数据库
3. 不直接注册 HTTP 接口
4. 不绕过宿主自己管理 secret

## OAuth 与回调策略

由于 runtime extension 不应自行注册 HTTP 接口，未来支持 `OAuth` 类数据源时，回调必须由宿主拥有。

设计规则：

1. 插件声明 `authorize_url`、`token_url`、`scopes`、`refresh_policy`
2. 宿主统一提供 callback endpoint
3. 宿主统一保管 access token / refresh token
4. 运行时调用时，宿主再把最小必要凭证传给插件

这保证：

1. 插件不直接暴露 HTTP surface
2. 宿主能统一做审计和权限控制
3. 不同 `OAuth` 源的接入方式可被平台统一编排

## 平台元数据模型建议

`data-source-platform` 建议新增以下领域记录：

1. `DataSourceInstanceRecord`
2. `DataSourceSecretRecord`
3. `DataSourceCatalogCacheRecord`
4. `DataSourcePreviewSessionRecord`
5. `DataSourceSyncJobRecord`
6. `DataSourceSyncCheckpointRecord`

V1 最低要求是前四个；`SyncJob` 和 `Checkpoint` 可在 V2 引入。

这些记录属于平台主存储，因此最终仍落在 `storage-durable -> storage-postgres` 这条线上。

## 演进路线

### V1

1. `storage-pg` 重命名为 `storage-postgres`
2. 新建 `storage-durable`
3. `api-server` 改为只依赖 `storage-durable`
4. 新建 `data-source-platform` 的基础领域模型与 service
5. 新增 `1flowbase.data_source/v1` 契约
6. 提供一个最小示例插件模板

### V2

1. 增加调度式同步 job
2. 增加 workspace 级绑定和导入映射
3. 增加宿主统一 `OAuth` 流程
4. 增加 adapter 契约测试和示例仓库

### V3

1. 增量同步
2. `webhook + polling` 混合刷新
3. schema drift 检测
4. 社区 adapter 兼容性测试矩阵

## 风险与约束

### 风险一：过早做统一写接口

结果：

1. 抽象很快失真
2. 插件能力被迫向最低公分母收敛
3. 平台后续要背负大量特殊分支

处理：

1. V1 只做读取、发现、导入

### 风险二：把外部数据源继续塞进 `storage-durable`

结果：

1. 平台主存储和外部源语义混杂
2. migration 归属失真
3. 后续命名再次崩坏

处理：

1. 外部数据源单独归到 `data-source-platform`

### 风险三：主仓库过早承诺多 durable backend

结果：

1. migration 成本飙升
2. 回归矩阵迅速膨胀
3. 主线开发变慢

处理：

1. 主仓库官方支持矩阵只维持 `PostgreSQL`

## 结论

最终架构结论如下：

1. `storage-durable + storage-postgres` 负责平台主存储
2. `data-source-platform + data-source plugin` 负责外部数据源接入
3. 主仓库官方只维护 `PostgreSQL` 主存储
4. 外部数据源从一开始就按插件扩展口设计
5. V1 只做接入、发现、预览、导入，不做统一写回

这保证主线足够简单，同时为未来第三方开发者扩展新的数据源 adapter 留出稳定空间。
