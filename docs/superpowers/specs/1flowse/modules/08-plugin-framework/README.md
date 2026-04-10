# 08 插件体系

日期：2026-04-10
状态：已完成

## 讨论进度

- 状态：`completed`
- 完成情况：已完成 P1 插件主线、插件类型、包结构、来源与启用规则、`manifest/schema`、本机 RPC 契约、升级卸载与依赖策略定稿，并获用户确认。
- 最后更新：2026-04-10 20:03 CST

## 已整理来源文档

- [2026-04-10-product-design.md](../../2026-04-10-product-design.md)
- [2026-04-10-product-requirements.md](../../2026-04-10-product-requirements.md)
- [2026-04-10-p1-architecture.md](../../2026-04-10-p1-architecture.md)

## 本模块范围

- 插件声明与注册
- 生命周期与发现机制
- 来源与可信策略
- 模型、节点、数据源、发布适配扩展

## 已确认

- P1 采用“声明式能力插件为主线 + 官方白名单受控代码插件补充”的双轨方案。
- 声明式能力插件由宿主内核执行；代码插件标准发布物为 `Wasm`，安装后统一由独立 `plugin-runner` 执行。
- 插件优先承接：模型供应商、节点类型、数据源、发布适配扩展。
- P1 插件类型先锁定为 `Provider`、`Node`、`DataSource`、`PublishAdapter` 四类，后续再按需求扩展。
- P1 前端插件系统不是首要目标，主方向仍是 `Headless Plugin`。
- 插件体系采用清单注册型，安装后不能要求主服务重启，应支持热生效。
- P1 至少需要安装任务、插件清单、已安装注册表、运行时激活机制。
- 插件包统一采用一套结构：`manifest + schema + assets + optional wasm`；无 `wasm` 即声明式插件，有 `wasm` 即代码插件。
- 插件来源至少区分：`official_whitelist`、`community`、`unknown`。
- `official_whitelist` 来源插件安装后可直接进入启用/激活流程，无需额外人工二次确认。
- 非白名单来源插件允许安装，但安装前必须展示明确风险提示。
- `community` / `unknown` 来源的代码插件启用前必须由 `root` 或 `admin` 二次确认，不得静默启用。
- P1 官方仓允许 `Rust` 代码插件；代码插件标准交付物为 `Wasm`；运行拓扑采用一个共享 `plugin-runner` 进程统一加载多个插件。
- 开发态插件采用远程调试注册；安装态采用下载包、安装任务和 runner 激活。
- `plugin-runner` 采用一个共享进程，并与主系统通过本机 RPC 契约交互。
- 管理边界定为：插件源策略系统级、插件安装团队级、插件使用范围默认团队级。
- `root` 可将团队已安装插件分配给指定应用空间，或设为应用级全局接受。
- `manifest` 必填字段先固定为：`api_version`、`kind`、`plugin_id`、`version`、`display_name`、`source_level`、`runtime_mode`、`entry`、`capabilities`、`compatibility`、`permissions`。
- `schema` 拆分为 `config_schema`、`secret_schema`、`io_schema` 三部分，分别承载普通配置、敏感配置与输入输出契约。
- `runtime_mode` 仅允许 `hosted` 与 `runner_wasm` 两种。
- 兼容性校验在 P1 先只检查 `host_api_version` 与最小 `runner` 版本。
- 插件自身版本采用 `semver`；`manifest.api_version` 仅在包协议出现破坏性变更时升级；同一 `api_version` 内仅允许向后兼容扩展字段。
- `plugin-runner` 与主系统的本机 RPC 方法集先固定为：`load`、`unload`、`invoke`、`health`、`list_loaded`、`reload`。
- RPC 请求统一带：`request_id`、`trace_id`、`team_id`、`app_id`、`plugin_id`、`plugin_version`、`timeout_ms`、`caller_context`。
- RPC 错误码先固定为：`INVALID_MANIFEST`、`INCOMPATIBLE_HOST`、`LOAD_FAILED`、`INVOKE_TIMEOUT`、`PERMISSION_DENIED`、`UNHEALTHY`、`INTERNAL_PANIC`。
- 超时基线先固定为：`load=10s`、`invoke=30s`、`health=3s`；超时后由主系统负责熔断与降级。
- 健康检查只分两层：`runner` 进程健康与插件实例健康。
- 生命周期状态先固定为：`downloaded -> installed -> disabled -> enabled -> active -> unhealthy -> disabled -> removed`。
- `official_whitelist` 来源插件安装后可直接进入 `enabled/active` 流程；`community/unknown` 来源代码插件安装后默认停留在 `disabled`，需 `root/admin` 二次确认后才能启用。
- 插件升级采用“新版本安装与预检 -> 激活新版本 -> 别名切换 -> 保留旧版本回滚窗口”的非原地覆盖流程。
- 插件若仍被应用、节点或数据源配置引用，则禁止卸载，只允许禁用。
- P1 不支持插件之间的运行时硬依赖；仅允许声明对宿主 API 版本与系统能力集的依赖。
- 若与早期架构稿中“进程内插件”表述冲突，应以后续 history 决策覆盖。
- 第三方登录后续若要引入，优先按插件扩展方向评估，不进入当前 P1 主线。

## 待讨论

- 无

## 当前结论摘要

- P1 插件体系采用“声明式能力插件 + 官方白名单受控代码插件”的双轨模型，以统一包结构与统一生命周期承接四类核心扩展。
- 声明式插件与代码插件共享一套安装、配置、审计、升级与使用范围治理模型，避免管理后台和控制面裂成两套体系。
- 代码插件统一收敛为 `Rust + Wasm + shared plugin-runner + local RPC`，把主系统聚焦在来源治理、配置校验、权限裁剪、安装任务和调用分发。
- 生命周期采用强约束策略：可信来源可直接启用，风险来源代码插件需 `root/admin` 二次确认；升级用并行激活切换，卸载受引用保护，不支持插件间硬依赖。

## 审阅入口

- 当前模块已通过。若后续继续推进实现，可直接围绕插件注册表、安装任务、`manifest/schema` 校验器、`plugin-runner` 本机 RPC 与应用分配模型展开。
