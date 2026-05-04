---
memory_type: project
topic: DeepSeek 官方供应商插件设计方向已确认
summary: 用户在 `2026-05-04 20` 明确确认采用“专用 DeepSeek 官方插件 + 主仓 provider runtime 余额能力扩展”的方向；DeepSeek 不复用 `openai_compatible` 配置绕过，也不把余额塞进 validate metadata。`2026-05-04 21` 进一步确认主仓 `ProviderUsage` 需要一等表达输入缓存命中 / 未命中字段，不能把 DeepSeek `prompt_cache_miss_tokens` 当成 `cache_write_tokens`。设计文档已写入 `docs/superpowers/specs/2026-05-04-deepseek-provider-design.md`。
keywords:
  - deepseek
  - model-provider
  - official-plugins
  - provider-runtime
  - balance
  - pricing
match_when:
  - 继续实现 DeepSeek 官方供应商插件
  - 需要判断余额接口应该放在插件 metadata 还是主仓 provider runtime contract
  - 需要确认 DeepSeek 是否应作为独立 provider 而非 OpenAI-compatible 配置项
created_at: 2026-05-04 20
updated_at: 2026-05-04 20
last_verified_at: 2026-05-04 21
decision_policy: verify_before_decision
scope:
  - docs/superpowers/specs/2026-05-04-deepseek-provider-design.md
  - ../1flowbase-official-plugins/runtime-extensions/model-providers/deepseek
  - api/crates/plugin-framework/src/provider_contract.rs
  - api/apps/plugin-runner/src/provider_host.rs
  - api/apps/api-server/src/routes/plugins_and_models/model_providers.rs
  - api/crates/control-plane/src/model_provider
---

# DeepSeek 官方供应商插件设计方向已确认

## 谁在做什么

- 用户确认 DeepSeek 要做成独立官方模型供应商插件。
- AI 已将设计写入 `docs/superpowers/specs/2026-05-04-deepseek-provider-design.md`，当前等待用户确认 spec 后再写 implementation plan 并实现。

## 为什么这样做

- DeepSeek 有独立模型、价格、缓存命中字段、思考模式参数和余额接口。
- 这些能力如果塞进 `openai_compatible`，会污染通用兼容插件，也无法把余额变成宿主可正式调用的能力。

## 为什么要做

- 后续 DeepSeek 价格、token 用量、缓存命中、工具调用和余额都需要被平台稳定消费。
- 余额接口属于 provider runtime 能力，不应只作为 validate 返回值或 provider metadata 的临时字段存在。

## 截止日期

- 暂无单独截止日期；当前是 `2026-05-04` DeepSeek provider 开发任务的设计确认阶段。

## 决策背后动机

- 专用插件承载 DeepSeek 品牌、默认地址、参数表、模型元数据和价格元数据。
- 主仓扩展 provider runtime balance contract，给后续控制台和 API 使用保留稳定入口。
- 主仓 `ProviderUsage` 应补齐 `input_cache_hit_tokens` 和 `input_cache_miss_tokens` 这类标准输入缓存字段；`cache_write_tokens` 只用于 provider 明确返回或明确按缓存写入计费的 token。
