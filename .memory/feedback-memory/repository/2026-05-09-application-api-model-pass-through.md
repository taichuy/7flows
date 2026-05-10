---
memory_type: feedback
feedback_category: repository
topic: application-api-model-pass-through
summary: 应用公开 API 的 `model` 字段不应被设计成公开 serving id 校验源；它只是 Native envelope 中与 `query` 同级的可选字符串，由节点和 mapping 自行消费。
keywords:
  - application api
  - native api
  - model
  - openai compatible
  - anthropic compatible
  - routing
match_when:
  - 设计或实现应用公开 API
  - 处理 OpenAI / Anthropic compatible `model` 字段
  - 编写 Native run request schema
created_at: 2026-05-09 23
updated_at: 2026-05-09 23
last_verified_at: 2026-05-09 23
decision_policy: direct_reference
scope:
  - docs/superpowers/specs/1flowbase/2026-05-09-application-public-api-design.md
  - api
  - web/app/src/features/applications
---

# Application API Model Pass Through

## 规则

应用公开 API 的 `model` 字段只作为 Native envelope 中与 `query` 同级的可选字符串字段。平台只校验它是字符串，不校验值、不参与应用路由、不要求它匹配公开 serving id，也不把它当 provider model。

## 原因

应用路由已经由 API Key 绑定应用决定。`model` 在 OpenAI / Anthropic 兼容协议中是常见输入，但 1flowbase 的应用编排可能希望把它作为普通节点输入、路由变量或完全忽略。平台提前校验具体值会把外部协议字段和内部编排策略耦合。

## 适用场景

- Native `/api/1flowbase/runs` request schema。
- OpenAI `/v1/chat/completions` 到 Native envelope 的映射。
- Anthropic `/v1/messages` 到 Native envelope 的映射。
- 应用 API Mapping UI 与发布快照设计。
