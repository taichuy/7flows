# 2026-04-10 08 插件体系细化决策

- `manifest` 必填字段先固定为：`api_version`、`kind`、`plugin_id`、`version`、`display_name`、`source_level`、`runtime_mode`、`entry`、`capabilities`、`compatibility`、`permissions`。
- `schema` 拆分为 `config_schema`、`secret_schema`、`io_schema`，分别用于普通配置、敏感配置和输入输出契约。
- `runtime_mode` 仅允许 `hosted` 与 `runner_wasm` 两种。
- P1 兼容性校验先只检查 `host_api_version` 与最小 `runner` 版本。
- 插件版本采用 `semver`；`manifest.api_version` 仅在包协议破坏性变更时升级；同一 `api_version` 内仅允许向后兼容扩展。
- `plugin-runner` 与主系统的本机 RPC 方法集先固定为：`load`、`unload`、`invoke`、`health`、`list_loaded`、`reload`。
- RPC 请求统一带：`request_id`、`trace_id`、`team_id`、`app_id`、`plugin_id`、`plugin_version`、`timeout_ms`、`caller_context`。
- RPC 错误码先固定为：`INVALID_MANIFEST`、`INCOMPATIBLE_HOST`、`LOAD_FAILED`、`INVOKE_TIMEOUT`、`PERMISSION_DENIED`、`UNHEALTHY`、`INTERNAL_PANIC`。
- 超时基线先固定为：`load=10s`、`invoke=30s`、`health=3s`；超时后由主系统负责熔断与降级。
- 健康检查只分两层：`runner` 进程健康与插件实例健康。
- 生命周期状态先固定为：`downloaded -> installed -> disabled -> enabled -> active -> unhealthy -> disabled -> removed`。
- `official_whitelist` 来源插件安装后可直接进入启用/激活流程；`community/unknown` 来源代码插件安装后默认停留在 `disabled`，需 `root/admin` 二次确认后才能启用。
- 升级采用“新版本安装与预检 -> 激活新版本 -> 别名切换 -> 保留旧版本回滚窗口”的非原地覆盖流程。
- 仍被应用、节点或数据源配置引用的插件禁止卸载，只允许禁用。
- P1 不支持插件之间的运行时硬依赖；仅允许声明对宿主 API 版本与系统能力集的依赖。
