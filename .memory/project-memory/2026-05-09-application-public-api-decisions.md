---
memory_type: project
topic: application-public-api-decisions
summary: 应用公开调用 API 方向确认：Key 只调用已发布版本；统一外部路由 `/api/1flowbase/runs`、OpenAI `/v1/chat/completions`、Anthropic `/v1/messages`；Key 绑定应用和创建人，用户仅看自己创建的 Key；Native payload 固定使用 `query/model/history`，其中 `model` 是可选字符串且不做值校验。
keywords:
  - application api
  - application api key
  - public route
  - native run api
  - openai compatible
  - anthropic compatible
  - streaming
created_at: 2026-05-09 23
updated_at: 2026-05-09 23
last_verified_at: 2026-05-09 23
decision_policy: verify_before_decision
scope:
  - api
  - web/app/src/features/applications
  - web/app/src/features/settings/components/ApiDocsPanel.tsx
---

# Application Public API Decisions

## 谁在做什么？

用户正在确认 1flowbase 应用级公开调用 API 的产品与协议方向，AI 后续需要基于这些确认输出设计文档和 implementation plan。

## 为什么这样做？

公开调用应面向“应用能力”而不是暴露具体 application id。API Key 绑定应用和创建人，外部路由统一不变，由 Key 鉴别进入哪个应用；Key 调用必须走已发布版本，不能调用编辑草稿。

## 为什么要做？

AgentFlow 已进入调试跑通阶段，下一阶段最重要业务是应用 API：生成应用 API Key、生成原生工作流接口、并将原生接口映射为 OpenAI `/v1/chat/completions` 与 Anthropic `/v1/messages` 兼容接口。文档组件复用 `/settings/docs` 的 Scalar/OpenAPI 能力，但应用详情内需要做面向当前应用的 API 组件，不跳转到全局文档页。

## 截止日期？

无固定截止日期；后续设计文档和计划应优先引用本决策。

## 决策背后动机？

- 应用 API Key：不限制数量；只做创建、列表、删除；绑定创建人；每个人仅能看到自己创建的 Key。
- 路由：Native 统一对外 `POST /api/1flowbase/runs`，所有应用类型共用；OpenAI 兼容 `/v1/chat/completions`；Anthropic 兼容 `/v1/messages`。
- Native payload 不能只做 `inputs/response_mode/user/metadata`，必须重新设计，覆盖 query、文件图片、会话绑定、本地 agent 工具回调、流式、协议映射预留。
- Native API 标准字段固定为 `query` 表达当前轮输入、`history` 表达外部上下文；OpenAI/Anthropic 兼容层都映射到这套 Native envelope，不在 Native API 里直接使用兼容协议的 `messages` 作为主结构。
- Native API 增加与 `query` 同级的可选 `model` 字符串字段；平台只校验它是字符串，不校验值、不按它路由、不要求它匹配公开 serving id。后续节点怎么使用 `model` 由应用编排和 mapping 自己配置。
- 文件输入第一版以 `upload_file_id` 为主；`url/base64` 作为协议预留，兼容层接到远程 URL 或 base64 时优先转换成内部 file record 后再进入 `attachments`。
- 兼容协议第一版可以只支持 text chat，但需要为 tools / files / images 等下一步计划预留；不兼容功能必须在 API 文档中写明，调用方可基于 Native API 自己转换或通过插件扩展。
- Streaming 是核心能力，第一版必须做。
