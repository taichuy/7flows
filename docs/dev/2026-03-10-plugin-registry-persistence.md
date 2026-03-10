# 插件注册表持久化

## 背景

前几轮已经把 `compat:dify` 的 adapter health、tool discovery、受约束 `constrained_ir`、执行契约和真实 invoke 翻译串起来了，但 API 侧的插件目录仍然主要停留在进程内 `PluginRegistry`：

- adapter 可以注册
- `sync-tools` 可以发现 compat 工具
- runtime 可以调用 compat 工具

一旦 API 进程重启，这些注册结果就会丢失，导致：

- 插件管理接口返回空目录
- `tool` 节点的 compat 绑定无法恢复
- “外部插件先压成受约束 IR”虽然成立，但没有稳定的持久化事实来源

## 目标

把插件注册表从“纯进程内状态”推进为“数据库事实 + 进程内运行缓存”两层：

1. adapter 注册结果可持久化
2. compat tool sync 结果可持久化
3. 新进程在拿到 `db` 会话后，能够把持久化目录重新补水到 `PluginRegistry`
4. 保持 `native` tool invoker 仍然是进程内能力，不强行把调用器落库

## 实现

### 1. 新增插件注册表持久化表

新增模型与迁移：

- `plugin_adapters`
- `plugin_tools`

其中：

- `plugin_adapters` 保存 adapter 的基础注册信息
- `plugin_tools` 保存工具目录、来源 adapter、`plugin_meta` 和 `constrained_ir`

这让 compat 工具不再只活在同步当次的内存里。

### 2. API 侧新增 `PluginRegistryStore`

新增 `api/app/services/plugin_registry_store.py`，负责三类动作：

- `upsert_adapter()`
- `upsert_tool()`
- `replace_adapter_tools()`

以及一类恢复动作：

- `hydrate_registry()`

这里刻意没有让数据库直接取代 `PluginRegistry`。数据库是事实层，`PluginRegistry` 仍然是运行时查找层；每次有 `db` 会话时，再把持久化事实补到运行时注册表。

### 3. 插件路由改为“先落库，再更新 registry”

`api/app/api/routes/plugins.py` 现在会在涉及 adapter/tool 的请求里：

1. 先用当前 `db` 会话补水 registry
2. 将变更写入数据库
3. 提交成功后再更新内存 registry

`sync-tools` 还补了一个关键动作：

- 以 adapter 为作用域替换工具目录
- 清理该 adapter 下已不再存在的旧工具

这样 adapter 重新同步时，目录不会只增不减。

### 4. 默认运行时支持按需恢复 compat 工具目录

`RuntimeService` 在使用默认 `PluginCallProxy` 时，会基于当前执行请求的 `db` 会话对 registry 做一次补水，再执行工作流。

这意味着：

- API 进程重启后
- 只要 `plugin_tools` 里已有 compat 工具目录
- 默认运行时就能在真正执行工作流前恢复这些工具定义

同时保留边界：

- 自定义注入的 `PluginCallProxy` 不受这层恢复逻辑影响
- `native` invoker 仍然由进程内注册负责

## 影响范围

- `api/app/models/plugin.py`
- `api/migrations/versions/20260310_0003_plugin_registry_persistence.py`
- `api/app/services/plugin_registry_store.py`
- `api/app/api/routes/plugins.py`
- `api/app/services/runtime.py`
- `api/tests/test_plugin_registry_store.py`

## 验证

执行：

```powershell
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m pytest api\tests
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m pytest services\compat-dify\tests\test_adapter_app.py services\compat-dify\tests\test_dify_daemon.py
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m compileall api\app services\compat-dify\app
```

结果：

- `api/tests` 77 个用例通过
- `services/compat-dify` 相关 13 个用例通过
- `api/app` 与 `services/compat-dify/app` 编译通过

## 当前边界

这轮仍然没有实现：

- adapter / tool 注册表的管理 API 分页、筛选和删除
- plugin invoke 更细粒度的 `run_events` 追踪
- 插件安装产物和样例 catalog 的统一安装目录治理
- 前端插件管理页直接消费持久化后的 `constrained_ir` / runtime binding

## 下一步

更连续的后续顺序是：

1. 让插件管理页和节点配置直接消费持久化后的 compat 工具目录
2. 在 `run_events` 里补更细的 plugin invoke trace 与错误分类
3. 再评估 adapter 生命周期管理 API，例如下线、重同步和清理
