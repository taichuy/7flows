# 1flowbase 插件架构与节点贡献设计稿

日期：2026-04-20
状态：已确认方向，待用户审阅

关联文档：
- [modules/08-plugin-framework/README.md](./modules/08-plugin-framework/README.md)
- [2026-04-18-model-provider-integration-design.md](./2026-04-18-model-provider-integration-design.md)
- [2026-04-19-rust-provider-plugin-runtime-distribution-design.md](./2026-04-19-rust-provider-plugin-runtime-distribution-design.md)
- [2026-04-19-plugin-trust-source-install-design.md](./2026-04-19-plugin-trust-source-install-design.md)

## 1. 文档目标

本文档用于把 `1flowbase` 当前关于插件体系的关键讨论收口成一套初期可执行的统一规则，重点明确：

- `host extension / runtime extension / capability plugin` 三类插件的真正语义
- 插件“怎么被消费”和“怎么执行/怎么回收”必须分轴建模
- 第三方画布节点插件的正式定位
- 第三方节点插件是否允许自定义 UI、是否允许自定义执行逻辑、如何管理
- 插件安装、分配、选择、worker 生命周期的最小状态机
- `plugin manifest v1` 与 `node contribution v1` 的最小字段集
- 初期必须明确拒绝的高风险方向

## 2. 背景与问题

当前仓库已经有一条最小但真实可运行的 provider 插件主线：

- provider 安装对象是 `.1flowbasepkg`
- provider runtime 是包内预编译可执行文件
- `plugin-runner` 通过独立子进程 + `stdio-json` 调用 provider runtime

与此同时，插件体系还存在三类容易混淆的问题：

### 2.1 插件分类和执行模型被混在一起

当前命名里已经有：

- `HostExtension`
- `RuntimeExtension`
- `CapabilityPlugin`

但这些名字更像“插件被谁消费、如何生效”的语义，不应直接等价于：

- 是否在主进程内运行
- 是否常驻子进程
- 是否需要热卸载
- 是否需要 worker 回收

如果不尽早拆开这两层，后续 provider 插件、第三方节点插件和宿主扩展会越来越难解释。

### 2.2 第三方画布节点插件需要与工具能力消费区分

本专题里的“工具节点”不是指“内置 Tool 节点消费工具能力”这条狭义语义，而是：

- 第三方可以开发插件
- 插件可以在产品上作为画布节点被用户选择和使用
- 节点 UI 仍然由 `1flowbase UI` 统一渲染

这更接近 `Dify` 的“插件贡献节点声明/节点实例”模式，而不是任意前端组件注入模式。

### 2.3 初期若不提前收口，会被高风险能力拖垮

最危险的几个方向是：

- 第三方代码进入主进程
- 热卸载动态库
- 第三方前端代码注入节点面板
- 用一个 `enabled` 状态试图覆盖安装、分配、选择和运行

这些都不适合在第一版开放生态时出现。

## 3. 本稿范围

本稿覆盖：

- 插件分类轴与执行轴
- 第三方节点插件的正式定位
- `plugin manifest v1`
- `node contribution v1`
- 生命周期与状态机
- 目录与控制面模型
- 权限、信任、版本与安全边界

本稿不覆盖：

- 热卸载设计
- 任意第三方前端节点组件注入
- 主进程内第三方动态库插件
- 节点插件的完整运行时 RPC 实现细节
- 最终前端页面与管理台 UI

## 4. 核心结论

### 4.1 插件体系必须分两条轴建模

第一条轴是 **消费语义**：

- `host_extension`
- `runtime_extension`
- `capability_plugin`

第二条轴是 **执行方式**：

- `in_process`
- `process_per_call`
- `warm_worker`
- `declarative_only`

后续任何插件都必须同时声明这两条轴，而不是只给一个类型。

### 4.2 `HostExtension` 是宿主级特权扩展，不把“官方来源”写死进类型

`HostExtension` 的正式语义是：

- 它参与宿主级系统扩展
- 它可以影响宿主对外资源或核心基础设施
- 它不属于第三方默认开放生态
- 它的准入应由部署侧来源策略与签名策略控制，而不是由类型名直接等价成“官方插件”

初期固定规则：

- 启动期加载
- 不支持热卸载
- 不进入普通 marketplace 安装入口
- `v1` 只允许 `source_kind=filesystem_dropin`
- 是否仅信任白名单来源、是否要求官方签名，由部署配置决定；默认建议开启严格策略
- 变更通过重启宿主相关服务生效

### 4.3 `RuntimeExtension` 用于扩展宿主 runtime slot

`RuntimeExtension` 的正式语义是：

- 它扩展宿主预定义 runtime slot
- 它通常不需要在画布中显式被用户当作“一个节点类型”来理解
- 它更多用于 provider kernel、后续 datasource runtime、trigger runtime 等统一运行内核扩展

初期固定规则：

- 第三方代码一律进程外执行
- 初期推荐执行方式为 `process_per_call`
- 后续性能不够时才演进到 `warm_worker`

### 4.4 `CapabilityPlugin` 用于贡献用户显式选择的能力

`CapabilityPlugin` 的正式语义是：

- 它需要在具体配置或画布里显式选中后才生效
- 它适合承载第三方节点贡献、工具能力、触发器能力等“用户可选能力”

第三方画布节点插件的正式定位固定为：

- `consumption_kind = capability_plugin`

而不是 `runtime_extension`。

### 4.5 第三方节点插件允许执行逻辑，但不允许自定义前端 UI

节点插件能力边界固定为：

- 允许：
  - 提供 `schema ui`
  - 提供节点声明
  - 提供配置期辅助逻辑
  - 提供运行期执行逻辑
- 不允许：
  - 注入第三方 React 组件
  - 注入第三方节点面板代码
  - 注入第三方浏览器脚本

宿主统一负责：

- 节点外观
- 表单渲染
- DSL 存储
- 运行态诊断展示

### 4.6 初期不限制源码语言，但严格限制交付形态

平台不按源码语言限制插件作者。

但平台必须限制交付形态：

- `declarative_only`
  - 只交付声明、schema 与元信息
- `self-contained executable`
  - 交付宿主可直接拉起的可执行产物

平台初期不负责：

- 在线安装第三方依赖
- 依赖宿主预装 Python / Node.js / JRE
- 现场编译插件源码

官方脚手架与 SDK 初期可只提供 Rust 模板，但这不等价于平台从架构上禁止其他源码语言。

## 5. 插件分类与执行方式矩阵

| consumption_kind | 语义 | 初期推荐 execution_mode | 是否第三方开放 | 是否显式选择 |
| --- | --- | --- | --- | --- |
| `host_extension` | 宿主系统级扩展 | `in_process` | 否，按部署策略受控 | 否 |
| `runtime_extension` | 扩展宿主 runtime slot | `process_per_call` | 控制开放 | 否 |
| `capability_plugin` | 贡献用户可选能力或画布节点 | `declarative_only` / `process_per_call` | 是 | 是 |

补充约束：

- `host_extension` 不进入普通 marketplace 开放生态
- `host_extension` `v1` 只允许 `filesystem_dropin`
- `runtime_extension` 与 `capability_plugin` 不允许注册系统级 HTTP 接口
- 第三方代码插件不进入主进程热加载路径

## 6. 第三方节点插件的正式模型

### 6.1 节点插件不是任意 UI 组件插件

第三方节点插件不是：

- 一段前端代码
- 一个可任意注入的 React 节点组件

第三方节点插件是：

- 一个 `CapabilityPlugin`
- 贡献一个或多个 `node_contribution`
- 由宿主使用固定节点壳进行渲染和管理

### 6.2 初期只开放动作型节点

初期节点插件只允许贡献 **动作型节点**，不开放 **控制流节点**。

初期允许的节点类型包括：

- 外部 API 调用节点
- 文本处理节点
- 数据转换节点
- 第三方系统动作节点
- 查询类节点

初期不开放的节点类型包括：

- 分支控制节点
- 循环节点
- 人工输入节点
- 调度/触发底层节点
- 修改编排图结构的节点
- 自定义 checkpoint 语义节点

### 6.3 节点插件支持的能力边界

第三方节点插件初期允许实现：

- `validate_config`
- `resolve_schema_ui`
- `resolve_dynamic_options`
- `resolve_output_schema`
- `migrate_config`
- `execute`

第三方节点插件初期不允许实现：

- 节点自定义前端 UI
- 节点运行态前端可视化组件
- 编排控制流内核扩展

## 7. plugin manifest v1

`plugin manifest v1` 至少包含以下字段：

### 7.1 基础信息

- `manifest_version`
- `plugin_id`
- `version`
- `vendor`
- `display_name`
- `description`
- `icon`
- `source_kind`
- `trust_level`

其中：

- `source_kind` 至少支持 `official_registry / mirror_registry / uploaded / filesystem_dropin`
- `trust_level` 独立表达系统对该安装对象的信任结果，不得与 `source_kind` 或阻断策略混用

### 7.2 分类与执行

- `consumption_kind`
- `execution_mode`
- `slot_codes`
- `binding_targets`
- `selection_mode`

### 7.3 兼容性

- `minimum_host_version`
- `contract_version`
- `schema_version`

### 7.4 权限

- `permissions.network`
- `permissions.secrets`
- `permissions.storage`
- `permissions.mcp`
- `permissions.subprocess`

### 7.5 运行时

- `runtime.protocol`
- `runtime.entry`
- `runtime.limits.timeout_ms`
- `runtime.limits.memory_bytes`
- `runtime.limits.idle_ttl_ms`
- `runtime.limits.max_requests`

### 7.6 国际化与发布

- `i18n`
- `checksum`
- `signature`

### 7.7 能力贡献

- `node_contributions[]`

## 8. node contribution v1

每个 `node_contribution` 至少包含：

- `contribution_code`
- `node_shell`
- `category`
- `title`
- `description`
- `icon`
- `schema_ui`
- `schema_version`
- `output_schema`
- `required_auth`
- `visibility`
- `experimental`
- `dependency.installation_kind`
- `dependency.plugin_version_range`

其中：

- `node_shell` 表示宿主固定节点壳类型
- `schema_ui` 是宿主统一表单渲染输入
- `contribution_code` 是 DSL 中真正保存的节点贡献身份

## 9. 生命周期与状态机

插件体系必须拆成四层生命周期，不能只保留一个 `enabled`。

### 9.1 安装任务状态

- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`
- `timed_out`

### 9.2 插件安装记录状态

- `downloaded`
- `verified`
- `installed`
- `enabled`
- `assigned`
- `disabled`

### 9.3 节点依赖状态

- `ready`
- `missing_plugin`
- `version_mismatch`
- `disabled_plugin`

### 9.4 worker 状态

- `unloaded`
- `starting`
- `idle`
- `busy`
- `recycled`
- `crashed`

初期规则：

- `HostExtension` 不做热卸载，不维护细粒度 worker 生命周期
- `RuntimeExtension` 与带执行逻辑的 `CapabilityPlugin` 初期都可以统一走 `process_per_call`
- `process_per_call` 模式下，每次调用结束即由操作系统回收进程资源

## 10. 控制面与目录模型

### 10.1 目录职责

宿主目录至少分为：

- `plugin-dropins/`
  - 运维控制的本地 drop-in 目录，供 `HostExtension` 与其它受控本地插件入口使用
- `plugin-packages/`
  - 原始安装包
- `plugin-installed/`
  - 当前已安装版本
- `plugin-working/`
  - 运行时工作目录
- `plugin-logs/`
  - 诊断日志目录

### 10.2 核心数据模型

控制面至少维护：

- `plugin_family`
- `plugin_version`
- `plugin_installation`
- `plugin_assignment`
- `plugin_task`
- `node_contribution_registry`
- `plugin_worker_lease`
- `plugin_audit_log`

### 10.3 控制面动作

控制面至少支持：

- `install plugin`
- `enable plugin`
- `disable plugin`
- `assign plugin`
- `list node contributions`
- `resolve plugin dependency`
- `start worker`
- `stop worker`
- `fetch plugin health`
- `switch plugin version`

## 11. 前端与 DSL 规则

画布 DSL 必须至少保存：

- `plugin_id`
- `plugin_version`
- `contribution_code`
- `node_shell`
- `schema_version`
- `config_payload`

block selector 固定规则：

- 只展示当前 workspace 可用的节点贡献
- 节点缺少依赖插件时，仍可在画布中显示，但需要变灰并提示安装入口

节点 UI 固定规则：

- 一律由 `1flowbase UI` 渲染
- 不加载第三方前端节点代码

## 12. 权限与安全边界

### 12.1 固定安全红线

- 第三方代码插件不进入主进程热加载/热卸载路径
- `HostExtension` 属于宿主级特权插件，来源允许与签名要求由部署配置决定
- 初期不考虑热卸载
- 第三方节点插件不允许携带前端代码注入宿主页面

### 12.2 进程边界

- `HostExtension`
  - 启动期加载
  - 启动期扫描运维控制的 `filesystem_dropin` 目录
  - 通过宿主重启生效
- `RuntimeExtension`
  - 统一由 `plugin-runner` 进程外执行
- `CapabilityPlugin`
  - `declarative_only` 时无独立执行进程
  - 有执行逻辑时也统一经 `plugin-runner` 进程外执行

### 12.3 风险说明

如果未来把第三方插件做成主进程内可重复加载/卸载的动态库插件，会重新进入 Rust TLS/static unload 风险区间。初期明确不走这条路线。

## 13. 初期非目标

当前轮次明确不做：

- 热卸载
- 任意第三方前端节点组件
- 主进程内第三方动态库插件
- 源码目录直接安装
- 安装时现场拉第三方依赖
- 节点插件扩展编排控制流内核

## 14. 实施顺序建议

建议按以下顺序推进：

1. 在 `plugin-framework` 中正式补齐 `consumption_kind + execution_mode + slot_code`
2. 定义 `plugin manifest v1`
3. 定义 `node contribution v1`
4. 在控制面补 `installation / assignment / dependency / worker` 模型
5. 在前端 block selector 接入节点贡献注册表
6. 让第三方节点插件先以 `CapabilityPlugin + declarative_only` 落地
7. 等 contract 稳定后，再为节点插件补 `process_per_call execute` 能力

## 15. 最终建议

`1flowbase` 插件体系初期应明确采用以下原则：

- 分类和执行分轴建模
- `HostExtension` 是宿主级特权插件，`v1` 仅允许 `filesystem_dropin`，启动期加载、无热卸载
- `RuntimeExtension` 只负责扩展宿主 runtime slot
- 第三方画布节点插件属于 `CapabilityPlugin`
- 节点 UI 只允许 `schema ui`，统一由宿主渲染
- 第三方节点插件可以有配置逻辑和执行逻辑，但执行必须进程外
- 初期先开放动作型节点，不开放控制流节点

这是当前阶段最稳、最容易演进、也最能避免架构返工的插件体系基线。
