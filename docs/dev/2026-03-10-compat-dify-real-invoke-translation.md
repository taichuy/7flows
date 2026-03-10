# compat:dify 真实 invoke payload 翻译

## 背景

上一轮已经把 compat 工具调用收紧为受约束执行契约，但 `services/compat-dify` 的 `/invoke` 仍然只是在本地回显：

- 校验 `executionContract`
- 返回 `received`
- 不产生真实 Dify plugin daemon 请求

这意味着“受约束 IR -> compat invoke”虽然已经成立，但 `compat:dify` 内部仍然缺少最关键的一层：

- 7Flows 的受约束工具输入究竟会被翻译成什么 Dify payload
- `plugin_id / provider / tool` 在 adapter 内部如何确定
- Dify daemon 返回的 `ToolInvokeMessage` 如何重新聚合成 7Flows 可消费输出

## 目标

把 `compat:dify` 的 `/invoke` 推进到“两段式真实实现”：

1. 默认 `translate` 模式
   - 生成真实 Dify plugin daemon invoke payload
   - 返回脱敏后的 payload 预览，方便调试和验证
2. 可选 `proxy` 模式
   - 在配置了 daemon URL / API key 后，把翻译后的 payload 转发给 Dify plugin daemon
   - 聚合流式 `ToolInvokeMessage` 为结构化输出

同时保持边界清晰：

- 外部协议翻译仍只存在于 compat 层
- API / runtime 继续只面向 `constrained_ir` 与统一的 `PluginCallProxy`

## 实现

### 1. compat-dify 新增 Dify daemon 翻译与代理层

新增 `services/compat-dify/app/dify_daemon.py`，负责三件事：

- 从本地 catalog tool 构造 Dify dispatch payload
- 将 file URI 翻译成 Dify 兼容的 file parameter 结构
- 可选转发到 Dify plugin daemon，并聚合流式返回

当前翻译后的 Dify 请求形状对齐本地 Dify 源码里的 `PluginToolManager.invoke()`：

```json
{
  "user_id": "...",
  "conversation_id": null,
  "app_id": null,
  "message_id": "trace-id",
  "data": {
    "provider": "...",
    "tool": "...",
    "credentials": {},
    "credential_type": "unauthorized | api-key",
    "tool_parameters": {}
  }
}
```

并附带：

- `X-Plugin-ID`
- `Content-Type: application/json`
- `X-Api-Key`（仅 proxy 时发送给 daemon）

### 2. catalog 为 invoke 翻译补运行时绑定信息

`services/compat-dify/app/catalog.py` 在 `plugin_meta` 中新增了 `dify_runtime`：

- `plugin_id`
- `provider`
- `tool_name`

当前推导规则：

- `plugin_id`
  - 优先取 `extra.dify_runtime.plugin_id`
  - 否则退化为 `identity.author`
- `provider`
  - 优先取 `extra.dify_runtime.provider`
  - 否则退化为 manifest 所在目录名
- `tool_name`
  - 优先取 `extra.dify_runtime.tool_name`
  - 否则使用工具 `identity.name`

这里刻意把 Dify 特有绑定信息放在 `plugin_meta` 中，而不是继续长进 `7Flows IR` 主体。

### 3. `/invoke` 默认返回脱敏后的真实 payload 预览

`services/compat-dify/app/main.py` 现在会在 `translate` 模式下返回：

- 经过契约校验的 `received`
- `credentialFields`
- `executionContract` 摘要
- `translatedRequest`

其中 `translatedRequest.body.data.credentials` 会被脱敏成 `***`，避免在调试输出中泄露 secret。

### 4. 可选代理到真实 Dify plugin daemon

当 `SEVENFLOWS_COMPAT_DIFY_INVOKE_MODE=proxy` 时：

- adapter 会把翻译后的 payload 发往
  - `POST {PLUGIN_DAEMON_URL}/plugin/{tenant_id}/dispatch/tool/invoke`
- 再按 Dify daemon 的 `PluginDaemonBasicResponse[ToolInvokeMessage]` 流式响应聚合结果

当前聚合包括：

- `text`
- `json`
- `variables`
- `files`
- `messages`
- `logs`

这让 7Flows 侧即使还没有直接接入 Dify 原生消息模型，也能先得到稳定的结构化结果。

## 影响范围

- `services/compat-dify/app/config.py`
- `services/compat-dify/app/catalog.py`
- `services/compat-dify/app/dify_daemon.py`
- `services/compat-dify/app/main.py`
- `services/compat-dify/README.md`
- `services/compat-dify/tests/test_adapter_app.py`
- `services/compat-dify/tests/test_dify_daemon.py`

## 验证

执行：

```powershell
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m pytest services/compat-dify/tests/test_adapter_app.py services/compat-dify/tests/test_dify_daemon.py
E:\code\taichuCode\7flows\api\.venv\Scripts\python.exe -m compileall services/compat-dify/app
```

结果：

- adapter app 用例通过
- Dify daemon 翻译 / 代理聚合用例通过
- `services/compat-dify/app` 可正常编译

## 当前边界

这轮仍然没有实现：

- 真实 Dify 插件安装与持久化安装目录
- provider identity 从完整 Dify provider yaml / 安装数据库精确恢复
- OAuth / credential 托管与解密
- `ToolInvokeMessage` 的全量类型一比一还原
- API 侧运行事件里更细粒度的 plugin invoke trace

## 下一步

更连续的后续顺序是：

1. 把 compat tool sync 结果推进到持久化存储，避免 runtime binding 只停留在进程内与本地样例目录
2. 让节点配置或插件管理页直接展示 `translatedRequest` / runtime binding，方便调试 compat 工具
3. 再评估是否把 Dify daemon 的更多消息类型与错误码映射进统一 `run_events`
