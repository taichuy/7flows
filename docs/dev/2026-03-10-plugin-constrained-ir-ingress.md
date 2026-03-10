# 插件受约束 IR 入口

## 背景

当前 `compat:dify` 已经具备：

- adapter health check
- tool discovery `/tools`
- API 侧 sync-tools 与进程内 `PluginRegistry`

但 discovery 返回的工具目录，之前仍然是“外部 YAML 被直接翻译成 API 可注册对象”的形状。这样虽然已经比透传 manifest 好一层，但仍缺少一个显式入口来回答：

- 外部插件到底是以什么受约束模型进入 7Flows
- 哪些字段是 adapter 允许带进来的
- API 侧究竟信任的是 adapter 原始返回，还是一份被规整后的内部形状

在继续推进真实插件 invoke 翻译前，先把这层入口固定下来，可以避免外部协议继续渗进核心运行时。

## 目标

把外部工具目录进入平台的链路收紧为：

1. `compat-dify` 先把 Dify manifest/tool YAML 归一化为受约束 `7Flows IR`
2. adapter `/tools` 返回该 `constrained_ir`
3. API catalog client 只从 `constrained_ir` 恢复 `PluginToolDefinition`
4. 缺少 `constrained_ir`、ecosystem 不一致或 id 不一致的工具目录直接拒绝

## 决策

### 1. adapter `/tools` 增加 `constrained_ir`

`services/compat-dify/app/schemas.py` 新增：

- `ConstrainedToolIR`
- `ConstrainedToolInputField`
- `ConstrainedToolConstraints`

当前受约束 IR 聚焦“工具注册入口需要的最小事实”：

- `tool_id`
- `ecosystem`
- `name` / `description`
- `input_schema` / `output_schema`
- `input_contract`
- `constraints`
- `plugin_meta`

它不是新的运行时 DSL，而是“外部工具进入平台前的约束收口层”。

### 2. adapter 归一化时顺手产出约束信息

`services/compat-dify/app/catalog.py` 在翻译 Dify 参数时，除了构造 JSON Schema，还会补出：

- `input_contract[].value_source`
  - `llm`
  - `user`
  - `credential`
  - `file`
- `constraints.credential_fields`
- `constraints.file_fields`
- `constraints.llm_fillable_fields`
- `constraints.user_config_fields`

同时继续强制：

- `input_schema.additionalProperties = false`

并收紧参数类型支持范围：

- 允许：`string`、`number`、`boolean`、`select`、`secret-input`、`file`
- 不支持的类型直接拒绝，而不是默默降级成普通字符串

### 3. API catalog client 只消费 `constrained_ir`

`api/app/services/plugin_runtime.py` 中的 `CompatibilityAdapterCatalogClient` 现在会：

- 要求每个 tool entry 必须带 `constrained_ir`
- 校验 `kind == tool`
- 校验 `ecosystem` 与 adapter registration 一致
- 校验顶层 `id` 与 `constrained_ir.tool_id` 不冲突
- 只从 `constrained_ir` 恢复 `PluginToolDefinition`

这意味着 API 侧不再把 adapter 返回的顶层展示字段当成事实来源，真正进入 `PluginRegistry` 的是受约束 IR。

## 影响范围

- `services/compat-dify/app/schemas.py`
- `services/compat-dify/app/catalog.py`
- `services/compat-dify/tests/test_adapter_app.py`
- `api/app/services/plugin_runtime.py`
- `api/tests/test_plugin_runtime.py`

## 验证

执行：

```powershell
cd api
.\.venv\Scripts\python.exe -m pytest tests/test_plugin_runtime.py tests/test_plugin_routes.py

cd ..\services\compat-dify
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m pytest tests/test_adapter_app.py
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m compileall app
```

验证结果：

- API plugin runtime / routes 用例通过
- `compat-dify` adapter app 用例通过
- `compat-dify` `app/` 可正常编译

## 当前边界

这轮仍然没有实现：

- 真实 Dify invoke 请求翻译
- manifest 安装产物持久化
- `constrained_ir` 到运行时 `tool` 节点配置模板的自动映射
- provider / datasource / trigger 等其他插件类型的受约束 IR

## 下一步

1. 在 `constrained_ir` 基础上补工具调用请求的受约束执行契约，而不是直接拼接外部 invoke payload。
2. 将 adapter sync 后的工具目录推进到持久化存储，避免只停留在进程内注册表。
3. 评估是否把 `constrained_ir` 进一步复用到插件管理页和未来节点配置表单生成链路。
