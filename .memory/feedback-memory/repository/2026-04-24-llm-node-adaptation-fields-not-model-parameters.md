---
memory_type: feedback
feedback_category: repository
topic: LLM 节点适配字段不要混入模型参数表单
summary: `tools`、`tool_choice`、`audio`、`modalities`、`user` 等 Chat Completions 字段不应默认放进 provider `parameter_form` 当作用户可调模型参数；先区分直接模型调参、LLM 节点能力、宿主追踪治理和后续工作流工具适配。
keywords:
  - llm
  - model-provider
  - parameter_form
  - tools
  - tool_choice
  - audio
  - modalities
  - user
  - node-adaptation
  - workflow
match_when:
  - 调整模型供应商参数 schema
  - 为 OpenAI 兼容 Chat Completions 增加新请求字段
  - 设计 LLM 节点工具调用、音频、多模态或响应格式配置
  - 审查哪些字段应进入用户可调模型参数面板
created_at: 2026-04-24 18
updated_at: 2026-04-24 18
last_verified_at: 2026-04-24 18
decision_policy: direct_reference
scope:
  - ../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/provider/openai_compatible.yaml
  - ../1flowbase-official-plugins/runtime-extensions/model-providers/openai_compatible/src/lib.rs
  - web/app/src/features/agent-flow
  - api/crates/plugin-framework/src/provider_contract.rs
  - api/crates/orchestration-runtime/src/execution_engine.rs
---

# LLM 节点适配字段不要混入模型参数表单

## 规则

- `parameter_form` 只放用户直接调整模型生成行为的参数，例如采样、长度、惩罚、logprob、随机种子、推理强度。
- `tools`、`tool_choice`、`parallel_tool_calls` 属于工具 / 后续工作流适配，应由 LLM 节点或宿主编排能力开启和注入，不应作为普通模型参数暴露。
- `audio`、`modalities` 属于节点输出形态 / 多模态能力适配，应由 LLM 节点能力设计承载，不应混进通用模型参数面板。
- `response_format` 应继续优先作为 LLM 节点专用返回格式配置处理，不回退为普通 provider 参数。
- `user`、`store`、`metadata` 属于宿主追踪、治理或供应商侧记录策略，后续如果需要暴露，应有单独的运行治理入口，不应默认进入模型调参表单。
- 插件运行时可以保留底层透传能力，供宿主明确注入；但插件 schema 不要因为 API 有字段就一股脑暴露给节点用户。

## 原因

- 请求体字段不等于用户应直接调整的模型参数。
- 工具、模态、响应格式和追踪治理会影响 LLM 节点与后续工作流的协作边界，混进 `parameter_form` 会让节点职责和模型供应商协议边界变脏。
- 先区分字段归属，可以避免后续为了“支持完整 API”把宿主工作流能力伪装成 provider 参数。

## 适用场景

- 审查官方 `openai_compatible` 插件参数 schema
- 为 LLM 节点设计工具调用、音频输出、多模态输出、结构化输出等能力入口
- 判断 Chat Completions / Responses API 新字段是否应该进入用户可调参数面板
