# compat:dify Stub Service

这是 `7Flows` 的 `compat:dify` 最小适配服务骨架。

当前目标不是一次性复刻完整 Dify 插件运行时，而是先提供一套稳定、可测试的独立服务边界，并把 `7Flows IR -> Dify invoke payload` 的翻译逻辑固化在 compat 层内部：

- `GET /healthz`
- `POST /invoke`

补充边界：

- `compat:dify` 是外部生态兼容层，不是 sandbox backend。
- `/invoke` 当前会接收统一的 `execution` payload 与 `executionContract`，用于表达 7Flows host 侧已解析的执行提示与受约束 contract；但真正的强隔离执行后端仍应走独立的 sandbox backend 协议，而不是把 compat adapter 直接当成隔离执行注册中心。

## 本地运行

```powershell
cd services/compat-dify
..\..\api\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8091
```

## 环境变量

- `SEVENFLOWS_COMPAT_DIFY_ADAPTER_ID`
- `SEVENFLOWS_COMPAT_DIFY_HEALTH_STATUS`
- `SEVENFLOWS_COMPAT_DIFY_DEFAULT_LATENCY_MS`
- `SEVENFLOWS_COMPAT_DIFY_INVOKE_MODE`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_URL`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_API_KEY`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_TENANT_ID`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_USER_ID`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_APP_ID`
- `SEVENFLOWS_COMPAT_DIFY_PLUGIN_DAEMON_TIMEOUT_MS`

## 调用模式

- `translate`
  - 默认模式
  - `/invoke` 会先按本地 `constrained_ir` 校验请求，再翻译成 Dify plugin daemon 的真实 dispatch payload
  - 会保留 host 侧透传的 `execution` 提示 contract，便于后续和已声明 capability 的执行边界对齐
  - 返回值会包含脱敏后的 `translatedRequest` 预览，便于调试翻译结果
- `proxy`
  - 需要同时配置 `PLUGIN_DAEMON_URL` 和 `PLUGIN_DAEMON_API_KEY`
  - `/invoke` 会把翻译后的 payload 转发到 Dify plugin daemon，并把流式 `ToolInvokeMessage` 聚合为 7Flows 可消费的结构化输出

## 当前映射假设

由于当前 catalog 仍然是“manifest + tool yaml”的最小安装产物，而不是完整 Dify 安装数据库，本服务当前会从本地目录推断最小 runtime binding：

- `plugin_id`
  - 优先取 `extra.dify_runtime.plugin_id`
  - 否则退化为 `identity.author`
- `provider`
  - 优先取 `extra.dify_runtime.provider`
  - 否则退化为 manifest 所在目录名
- `tool_name`
  - 优先取 `extra.dify_runtime.tool_name`
  - 否则使用工具 `identity.name`

这能支撑“真实 payload 翻译”和受约束代理，但还不是完整的 Dify 安装态建模。

## 当前边界

- 只支持 `compat:dify`
- 真实代理只覆盖 tool invoke dispatch，不覆盖完整插件安装生命周期
- 仍不负责 manifest 安装、凭证解密托管和持久化安装恢复
