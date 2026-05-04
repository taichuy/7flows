# DeepSeek 供应商插件设计

日期：2026-05-04

## 背景

官方插件源码仓库是 `/home/taichu/git/1flowbase-official-plugins`。
`api/plugins/installed/` 是安装态产物目录，不能作为源码入口。

当前官方供应商只有 `openai_compatible`。主仓 provider stdio contract 目前只暴露 `validate`、`list_models` 和 `invoke`，没有一等余额查询方法。因此 DeepSeek 供应商需要两类协同改动：

- 在官方插件仓库新增专用 `deepseek` runtime model provider 插件；
- 在主仓扩展 1flowbase provider runtime contract 和 console API，增加供应商余额能力。

## 外部 API 事实

资料来源：

- DeepSeek Chat Completions：`https://api-docs.deepseek.com/zh-cn/api/create-chat-completion`
- DeepSeek Models：`https://api-docs.deepseek.com/zh-cn/api/list-models`
- DeepSeek Balance：`https://api-docs.deepseek.com/zh-cn/api/get-user-balance`
- DeepSeek Pricing：`https://api-docs.deepseek.com/zh-cn/quick_start/pricing`
- DeepSeek Context Cache：`https://api-docs.deepseek.com/zh-cn/guides/kv_cache`
- DeepSeek Thinking Mode：`https://api-docs.deepseek.com/zh-cn/guides/thinking_mode`

DeepSeek 的 OpenAI 格式 base URL 是 `https://api.deepseek.com`。

需要接入的端点：

- `POST /chat/completions`
- `GET /models`
- `GET /user/balance`

当前模型 ID：

- `deepseek-v4-flash`
- `deepseek-v4-pro`

DeepSeek V4 支持 JSON 输出、工具调用、思考模式、1M 上下文和最大 384K 输出。DeepSeek usage 会用 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens` 返回缓存命中和未命中的输入 token。

当前公开价格按每百万 token 计：

| 模型 | 输入缓存命中 | 输入缓存未命中 | 输出 |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | CNY 0.02 | CNY 1 | CNY 2 |
| `deepseek-v4-pro` | CNY 0.025 | CNY 3 | CNY 6 |

价格是时间敏感信息。插件应在当前价格 metadata 中保存 `as_of: 2026-05-04` 和文档来源字段，后续价格刷新必须通过显式版本化变更处理。

## 方案

使用专用 DeepSeek 插件，不让用户手动配置 `openai_compatible` 来绕过。

这样可以把供应商身份、图标、本地化文案、DeepSeek 专属参数、静态模型元数据、价格元数据、缓存 token 映射和余额能力放在一起，也避免 OpenAI-compatible 通用插件继续积累供应商特例。

## 主仓 Contract 改动

沿现有 provider runtime 路径增加一等余额查询方法：

- 扩展 `ProviderStdioMethod`，新增 `GetBalance` 或 `Balance`；
- 在 `plugin-framework` 中新增 `ProviderBalanceInfo` 和 `ProviderBalanceResult` 结构；
- 新增 `ProviderHost::get_balance`；
- 新增 `ProviderRuntimePort::get_balance`；
- 在模型供应商实例接口面暴露 API route，建议为：
  - `GET /api/console/model-providers/{id}/balance`

余额 route 行为：

- 使用与 validate / refresh 相同的模型供应商 manage 级权限；
- 通过现有 provider runtime config 路径加载 instance、installation 和解密后的 provider config；
- 调用插件 runtime method `balance`；
- 返回 `is_available` 和 `balance_infos`；
- 不返回任何 provider secret。

本轮不做计费账本、持久化价格表或 UI 成本仪表盘。

## DeepSeek 插件形态

新增目录：

`/home/taichu/git/1flowbase-official-plugins/runtime-extensions/model-providers/deepseek`

预期文件：

- `manifest.yaml`
- `Cargo.toml`
- `src/main.rs`
- `src/lib.rs`
- `provider/deepseek.yaml`
- `models/llm/_position.yaml`
- `models/llm/deepseek-v4-flash.yaml`
- `models/llm/deepseek-v4-pro.yaml`
- `i18n/en_US.json`
- `i18n/zh_Hans.json`
- `_assets/icon.svg`
- `readme/README_en_US.md`

Provider config 字段：

- `api_key`，secret，必填
- `base_url`，string，必填，默认 `https://api.deepseek.com`
- `validate_model`，boolean，可选高级项，默认 true

专用插件不需要 organization、project、api-version、default-headers 字段。

## 聊天调用

宿主 invocation 路径以 streaming 为第一形态。DeepSeek 插件调用 DeepSeek 时应发送：

- `stream: true`
- `stream_options: { "include_usage": true }`

插件应解析 Server-Sent Events，并增量输出 provider stream events。

消息处理：

- 转发 system、user、assistant 和 tool message；
- tool message 存在 `tool_call_id` 时保留该字段；
- 将文本 delta 映射为 `TextDelta`；
- 将 reasoning delta / `reasoning_content` 映射为 `ReasoningDelta`；
- 将 function tool call 映射为 `ToolCallDelta` 和 `ToolCallCommit`；
- 将终止原因映射到宿主 enum，`insufficient_system_resource` 等未知值按 unknown 处理。

Provider form 暴露的请求参数：

- `thinking_type`：enum `enabled` / `disabled`，发送为 `thinking: { "type": value }`
- `reasoning_effort`：enum `high` / `max`
- `temperature`
- `top_p`
- `max_tokens`
- `response_format`：enum `text` / `json_object`，发送为 `response_format: { "type": value }`
- `stop`
- `tool_choice`：`none` / `auto` / `required`
- `logprobs`
- `top_logprobs`
- `user_id`

Tools 优先来自宿主 `tools` 数组。兼容上可以接受 raw `tools` model parameter，但不应作为普通 provider form 字段展示。

DeepSeek 已废弃的 `frequency_penalty` 和 `presence_penalty` 不应暴露在专用 provider UI 中。

## Usage 与价格元数据

DeepSeek usage 说明：

- DeepSeek 的上下文硬盘缓存默认开启；
- 每次请求都会触发缓存构建；
- DeepSeek 返回的是输入 token 的缓存命中情况，不返回独立“写入缓存 token”；
- 价格口径按输入缓存命中、输入缓存未命中、输出三类计费。

主仓 `ProviderUsage` 需要补齐输入缓存命中 / 未命中字段，而不是只依赖 provider metadata：

- `input_tokens`
- `input_cache_hit_tokens`
- `input_cache_miss_tokens`
- `output_tokens`
- `reasoning_tokens`
- `cache_write_tokens`
- `total_tokens`

字段语义：

- `input_cache_hit_tokens`：输入中命中 provider 缓存的 token，DeepSeek 对应 `prompt_cache_hit_tokens`；
- `input_cache_miss_tokens`：输入中未命中 provider 缓存的 token，DeepSeek 对应 `prompt_cache_miss_tokens`；
- `cache_write_tokens`：只表示 provider 明确返回或明确按“缓存写入 / 缓存创建”计费的 token。DeepSeek 当前没有这个返回字段，不应从 miss tokens 推导。

DeepSeek usage 归一化规则：

- `prompt_tokens` -> `input_tokens`
- `completion_tokens` -> `output_tokens`
- `total_tokens` -> `total_tokens`
- `completion_tokens_details.reasoning_tokens` 或顶层 `reasoning_tokens` -> `reasoning_tokens`
- `prompt_cache_hit_tokens` -> `input_cache_hit_tokens`
- `prompt_cache_miss_tokens` -> `input_cache_miss_tokens`

为兼容已有运行观测字段，实施时可以保留 `cache_read_tokens` 作为 `input_cache_hit_tokens` 的旧口径 alias，但新的设计和价格计算应优先使用 `input_cache_hit_tokens` / `input_cache_miss_tokens`。

模型 metadata 应包含：

- `owned_by`
- `context_window: 1000000`
- `max_output_tokens: 384000`
- streaming、tool call、structured output、reasoning 能力标记
- pricing 对象：
  - currency `CNY`
  - unit `million_tokens`
  - 输入缓存命中价格
  - 输入缓存未命中价格
  - 输出价格
  - `as_of: 2026-05-04`
  - 来源 URL

动态 `/models` 返回结果应与静态 metadata 合并，使 DeepSeek 返回的模型 ID 保留内置的更完整 metadata。

## 错误处理

插件应通过现有 provider runtime error normalization 映射 HTTP status 和 DeepSeek error payload：

- 401/403 -> auth failed
- 404 或 model-not-found 风格 payload -> model not found
- 429/quota/rate 消息 -> rate limited
- network/connect/timeout/5xx -> 尽可能映射为 endpoint unreachable
- malformed response -> provider invalid response

余额 route 应返回正常的 provider runtime error response，不吞掉上游失败。

## 测试

生产实现前必须先写测试。

官方插件仓库：

- 单元测试 config 归一化和 DeepSeek 默认 base URL；
- 单元测试聊天请求体包含 `thinking`、`reasoning_effort`、`response_format`、`tool_choice`、`user_id`、tools 和 stream usage；
- 如果实现内部 non-streaming JSON completion helper，补对应解析测试；
- 单元测试 streaming SSE 解析 text、reasoning、tool call、usage、finish；
- 单元测试 DeepSeek usage 映射 cache hit tokens，并将 miss tokens 保留在 metadata；
- 单元测试 `/models` 归一化会合并静态价格和能力 metadata；
- 单元测试 `/user/balance` 归一化。

主仓：

- plugin-framework contract 序列化测试，覆盖新的 balance method / result；
- plugin-runner route 或 host 测试，覆盖 `balance`；
- api-server route 测试，覆盖 `GET /api/console/model-providers/{id}/balance`；
- control-plane 测试，证明 balance 使用解密后的 provider config 且不泄露 secret；
- 定向 contract 测试，确认既有 `validate`、`list_models` 和 streaming `invoke` 行为不回退。

## 验收证据

交付前最小验证：

- DeepSeek provider crate 的 `cargo test`；
- 官方插件脚本测试能发现 `openai_compatible` 和 `deepseek`；
- 主仓定向 Rust 测试覆盖 provider balance contract、plugin-runner、control-plane / API route；
- 如果本地 host packaging CLI 和 cross target 可用，执行 DeepSeek provider package dry-run；
- warning / coverage 产物不落到 `tmp/test-governance/` 以外。

## 停止条件

出现以下任一情况时停止并先确认：

- 主仓 provider contract 无法在不改持久化 schema 的前提下接受新的 balance method；
- package format 拒绝专用 DeepSeek provider metadata 形态；
- 实现期间 DeepSeek 文档变更了模型 ID、余额响应或价格；
- 本地环境无法构建 provider crate 或运行定向测试。
