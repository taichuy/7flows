# Plugin Call Proxy Runtime Foundation

## 背景

`docs/dev/runtime-foundation.md` 已将 “Dify 插件兼容代理” 标记为后端下一步，但当前后端最初只具备：

- `tool` 节点占位执行
- 没有 native / compat:* 统一注册表
- 没有 compat adapter 注册对象
- 没有按 ecosystem 路由的插件调用代理

如果继续把 Dify 兼容逻辑直接写进运行时，会破坏 `7Flows IR` 优先和“兼容层旁挂”的架构边界。

## 目标

先落一条最小但真实可扩展的后端链路：

1. 在 `api/` 内部建立统一插件注册表
2. 为 compat adapter 建立显式注册对象
3. 提供 native / compat:* 统一的 `PluginCallProxy`
4. 让声明绑定的 `tool` 节点可以走真实插件调用
5. 保持未绑定 `tool` 节点的占位语义，避免打断现有运行时测试基线
6. 让系统概览能够回答 “当前有没有 adapter、它是否可达”

## 实现

### 1. 新增插件运行时基础对象

新增 `api/app/services/plugin_runtime.py`：

- `PluginToolDefinition`
- `CompatibilityAdapterRegistration`
- `CompatibilityAdapterHealth`
- `PluginCallRequest`
- `PluginCallResponse`
- `PluginRegistry`
- `PluginCallProxy`
- `CompatibilityAdapterHealthChecker`

当前能力边界：

- `native` 工具可通过内存注册的 invoker 直接执行
- `compat:*` 工具通过 adapter registration 路由到外部 HTTP adapter 的 `/invoke`
- compat adapter 可通过 `GET {endpoint}/healthz` 做最小健康探测
- 默认只从配置里自动注册 `compat:dify` adapter 的 endpoint，不假装已具备安装/发现/生命周期全链路

### 2. 运行时接入 `tool` 节点

`api/app/services/runtime.py` 新增了薄接入：

- `RuntimeService` 支持注入 `PluginCallProxy`
- `tool` 节点声明 `config.tool.toolId` 或 `config.toolId` 时，走真实插件调用
- 默认把 `accumulated / mapped / upstream / trigger_input` 中第一个非空 dict 作为工具输入
- trace id 先按 `run:{run_id}:node:{node_id}` 生成，供后续 adapter 串联日志与事件

兼容策略：

- 若 `tool` 节点未声明绑定，仍保持当前占位执行输出
- 若显式声明了错误绑定，则在 schema 或运行时阶段明确报错

### 3. 配置项

`api/app/core/config.py` 新增：

- `plugin_default_timeout_ms`
- `plugin_compat_dify_enabled`
- `plugin_compat_dify_adapter_id`
- `plugin_compat_dify_endpoint`

这让 Dify adapter 的存在形式明确为可开关、可替换 endpoint 的 compat registration，而不是写死在运行时分支里。

### 4. Schema 约束

`api/app/schemas/workflow.py` 新增 `WorkflowNodeToolBinding`，用于校验：

- `config.tool.toolId`
- `ecosystem`
- `adapterId`
- `credentials`
- `timeoutMs`

当前只在声明了 `config.tool` / `config.toolId` 时校验，不强制所有 `tool` 节点立刻升级到真实绑定模式。

### 5. 系统概览与只读观测接口

`api/app/api/routes/system.py` 继续补上了 adapter 可观测性最小闭环：

- `GET /api/system/overview` 返回 `plugin_adapters`
- `services` 中增加 `plugin-adapter:{id}` 健康项
- `GET /api/system/plugin-adapters` 提供独立的只读 adapter 状态列表

当前健康判定策略：

- disabled adapter 返回 `disabled`
- `GET /healthz` 返回 `2xx` 视为 `up`
- 请求失败或非 `2xx` 视为 `down`

这一步的目标不是做完整生命周期管理，而是先把 adapter 的存在性与可达性暴露出来，供后续插件管理页和诊断页复用。

## 影响范围

- `api/app/core/config.py`
- `api/app/schemas/workflow.py`
- `api/app/services/plugin_runtime.py`
- `api/app/services/runtime.py`
- `api/app/api/routes/system.py`
- `api/tests/test_plugin_runtime.py`
- `api/tests/test_system_routes.py`
- `api/tests/test_workflow_routes.py`

## 验证

已完成：

- `.\.venv\Scripts\python.exe -m pytest`
- `.\.venv\Scripts\ruff.exe check app tests`
- `.\.venv\Scripts\python.exe -m compileall app`

结果：

- `api/tests` 全量 53 个测试通过
- `ruff` 检查通过

## 当前边界与下一步

本轮故意没有继续往下做：

- Dify 插件 manifest 安装/发现
- adapter 生命周期管理与持久化配置
- 插件管理 API / 持久化注册
- 运行时事件里的细粒度插件调用日志

建议下一步按下面顺序推进：

1. 建立插件发现 / 注册接口，而不是只支持内存注册
2. 定义 Dify adapter `/invoke` 与 `/healthz` 的请求响应契约文档
3. 再接入插件安装、manifest 翻译和工具目录管理
4. 将 adapter 健康状态纳入后续插件管理页和系统诊断视图
