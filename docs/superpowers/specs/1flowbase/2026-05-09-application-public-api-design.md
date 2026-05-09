# 应用公开 API、应用 API Key 与兼容协议设计

日期：2026-05-09

状态：已完成方案讨论，待用户审阅

取代文档：无

关联记忆：
- `.memory/feedback-memory/repository/2026-04-15-application-api-routing-bound-by-key-not-path.md`
- `.memory/project-memory/2026-05-09-application-public-api-decisions.md`

关联代码：
- `api/apps/api-server/src/routes/applications/application_runtime.rs`
- `api/apps/api-server/src/routes/identity/api_keys.rs`
- `api/apps/api-server/src/routes/settings/docs.rs`
- `api/apps/api-server/src/openapi_docs.rs`
- `api/crates/control-plane/src/auth.rs`
- `api/crates/control-plane/src/orchestration_runtime.rs`
- `api/crates/domain/src/application.rs`
- `api/crates/domain/src/orchestration.rs`
- `api/crates/storage-durable/postgres/migrations/20260430113000_create_api_key_tables.sql`
- `web/app/src/features/applications/pages/ApplicationDetailPage.tsx`
- `web/app/src/features/settings/components/ApiDocsPanel.tsx`
- `web/packages/api-client/src/console-api-docs.ts`

参考实现：
- `../dify/api/controllers/console/apikey.py`
- `../dify/api/controllers/service_api/wraps.py`
- `../dify/api/controllers/service_api/app/workflow.py`
- `../dify/api/controllers/service_api/app/completion.py`
- `../dify/api/controllers/service_api/app/message.py`

## 1. 文档目标

本文固定 1flowbase 应用公开 API 的第一版设计，包括应用 API Key、统一 Native API、OpenAI 兼容接口、Anthropic 兼容接口、发布版本约束、流式事件、会话、文件输入、协议映射配置和应用详情 API 文档组件。

核心目标：

1. 外部调用 URL 不暴露 `application_id`，同类能力使用统一路由。
2. 应用身份由应用 API Key 绑定，不由路径参数决定。
3. API Key 只能调用应用的当前 active published version，不能调用编辑草稿。
4. Native API 是唯一核心协议；OpenAI 和 Anthropic 只做适配层。
5. Native API 必须覆盖 `query`、结构化输入、历史上下文、文件图片、会话、流式、运行追踪、等待态和后续工具扩展。
6. 应用详情 API tab 直接复用并抽象现有 `/settings/docs` 文档组件，不跳转到全局文档页。

本文不是 implementation plan；实现前需要拆单独计划。

## 2. 当前事实

### 2.1 已有能力

当前仓库已有：

1. `api_keys` 表和 `ApiKeyService`，支持 token hash、prefix、创建人、scope、过期和数据模型权限。
2. Data Model runtime API 已使用 `Authorization: Bearer <api_key>`。
3. Application API 分区已经预埋 `application_api_key`、`api_key_bound_application`、`planned` 等状态文案。
4. AgentFlow 已有 console debug run 路由和 RuntimeEventStream 调试流。
5. `/settings/docs` 已经基于 OpenAPI registry 和 Scalar 组件提供分类、接口列表和单接口详情。

### 2.2 缺口

当前缺少：

1. 应用级 API Key 与应用绑定关系。
2. 应用发布版本快照与 active published version 调用约束。
3. 外部 Native run API。
4. OpenAI `/v1/chat/completions` 兼容路由。
5. Anthropic `/v1/messages` 兼容路由。
6. Native envelope 到 AgentFlow / future application type 的分发边界。
7. 应用内 API 文档与调试组件。
8. 应用级协议映射配置。

### 2.3 Dify 参考结论

Dify 可借鉴的不是路径命名本身，而是边界：

1. Console 侧按 app 管理 API key。
2. Service API 侧只看 Bearer token，由 token 反查 app。
3. 外部调用路径稳定，具体 app 由 token 决定。
4. App token 校验后再检查 app 状态、tenant 状态和 API enabled 状态。
5. Token 使用记录异步更新，避免阻塞热路径。

1flowbase 不照搬 Dify 的 Flask controller、Celery、Redis cache 和 response shape。1flowbase 使用 Rust control-plane / API server / durable storage 边界，并保持 Native API 为核心协议。

## 3. 用户确认的硬决策

1. Key 调用必须使用已发布版本。
2. 对外路由统一不变，由生成的 Key 识别进入哪一个应用。
3. 应用 API Key 不限制数量。
4. 应用 API Key 第一版只做创建、列表、删除。
5. 应用 API Key 必须绑定创建人；每个人仅能看到自己创建的 Key。
6. 不在应用 API Key 列表中给 Root 增加“查看所有人 Key”的特殊权限。
7. Native API 统一入口为 `/api/1flowbase/runs`。
8. 所有应用类型共用同一 Native API 路由；应用类型内部如何执行是应用自身职责。
9. Native API 标准字段固定使用 `query` 表达当前轮输入、`history` 表达外部上下文。
10. Native API 文件输入第一版以 `upload_file_id` 为主；`url/base64` 作为协议预留，兼容层可先转换成内部 file record。
11. OpenAI 兼容 `/v1/chat/completions`。
12. Anthropic 兼容 `/v1/messages`。
13. 兼容协议到 Native API 的字段映射需要配置。
14. 第一版兼容协议可只支持 text chat，但必须为 tools、files、images 等下一步计划预留。
15. Streaming 是第一版核心能力，必须实现。
16. 不兼容功能需要在 API 文档中写明；调用方可基于 Native API 自己转换，或后续通过插件扩展。
17. 应用 API tab 直接复用文档组件，可分 tabs，不跳转全局 settings docs。
18. 如果现有 API docs 组件抽象不够，需要抽成共享组件。
19. 应用 API tab 可写入在线调试能力；前端不长期保存完整 Key。
20. `model` 是 Native envelope 中与 `query` 同级的可选字符串字段；平台只校验字符串类型，不校验值、不按它路由、不要求它匹配公开 serving id，后续节点怎么使用由应用编排和 mapping 自己决定。

## 4. 设计原则

1. 核心层回答“这次运行该不该执行”；OpenAI / Anthropic adapter 只回答“外部协议如何转换”。
2. 路由不携带 `application_id`；应用身份只来自应用 API Key。
3. API Key 绑定应用，不绑定发布版本；调用时读取应用当前 active published version。
4. 发布版本快照必须不可变；编辑草稿、debug run 和 published run 分离。
5. Native API 是第一等协议；兼容协议不能把第三方字段直接推进核心运行模型。
6. `query` 是当前轮用户输入；`inputs` 是结构化业务变量；二者不能混用。
7. `model` 是可选外部输入字段，只校验字符串类型；平台不把它当应用路由、provider model 或 serving id 校验源。
8. `history` 是外部上下文，不替代服务端 conversation truth。
9. 文件、图片、音频等输入统一进入 `attachments`；第一版稳定支持内部 `upload_file_id`。
10. Streaming 默认只输出 assistant 文本增量；工作流公开事件需要显式开启。
11. OpenAI / Anthropic 兼容接口要尽量模拟各自标准响应与错误结构，保障 SDK 体验。
12. 应用 API 文档要面向当前应用和当前发布状态，而不是只展示全局 OpenAPI。

## 5. 范围

### 5.1 本阶段范围

1. 应用 API Key 管理。
2. 应用发布版本与 API enabled 状态。
3. Native API run / get / resume / cancel / file upload。
4. Native SSE streaming。
5. OpenAI `/v1/chat/completions` blocking 与 streaming。
6. Anthropic `/v1/messages` blocking 与 streaming。
7. 协议映射配置的最小 UI 与存储。
8. 应用 API tab：API Keys、Native API、OpenAI Compatible、Anthropic Compatible、Mapping。
9. OpenAPI docs registry 支持应用内专属 API docs。
10. 对 unsupported feature 的文档与错误结构。

### 5.2 非目标

1. 不在第一版实现 OpenAI tools / function_call。
2. 不在第一版实现 Anthropic tools / tool_choice。
3. 不在第一版实现多 active version、灰度发布或指定版本调用。
4. 不把 `application_id` 放进外部调用 URL。
5. 不让兼容协议绕过 Native run service。
6. 不在应用 API Key 列表里实现 Root 全局查看所有人 Key。
7. 不让前端长期保存完整 API Key。

## 6. 总体架构

```text
External Client
  -> /api/1flowbase/runs
  -> Native API Route
  -> ApplicationApiKeyAuthenticator
  -> ApplicationPublishedRunService
  -> Application Type Runtime Adapter
  -> Orchestration Runtime / future application runtime

OpenAI SDK
  -> /v1/chat/completions
  -> OpenAI Compatibility Adapter
  -> Native Run Request
  -> same Native Service

Anthropic SDK
  -> /v1/messages
  -> Anthropic Compatibility Adapter
  -> Native Run Request
  -> same Native Service
```

边界：

1. `ApplicationApiKeyAuthenticator` 只负责 token 校验、应用解析、创建人和应用状态检查。
2. `ApplicationPublishedRunService` 只负责发布版本选择、运行创建、会话绑定、等待态、取消和查询。
3. `Application Type Runtime Adapter` 根据应用类型消费 Native envelope。第一版落到 AgentFlow published snapshot，后续 workflow 或其他应用类型沿用同一入口。
4. OpenAI / Anthropic adapter 只做输入输出映射和错误结构转换。

## 7. 发布版本模型

### 7.1 active published version

应用 API 调用固定使用应用当前 `active published version`。

规则：

1. 发布动作生成不可变版本快照。
2. API Key 绑定应用，不绑定版本。
3. 调用时按应用读取当前 active published version。
4. 编辑草稿只用于 console editor 和 debug run。
5. 如果应用没有 active published version，公开 API 返回 `409 application_not_published`。

第一版不支持灰度、不支持指定版本、不支持 key 固定版本。

### 7.2 发布快照内容

AgentFlow 发布快照至少包含：

1. flow document snapshot。
2. compiled plan 或可重复编译所需的 source snapshot。
3. mapping config snapshot。
4. runtime profile / provider routing snapshot。
5. output selector contract。
6. application type 和 schema version。

## 8. 应用 API Key

### 8.1 管理接口

Console route 仍可带 application id，因为这是内部管理接口，不是外部调用 URL。

```http
GET /api/console/applications/{application_id}/api-keys
POST /api/console/applications/{application_id}/api-keys
DELETE /api/console/applications/{application_id}/api-keys/{key_id}
```

### 8.2 数据规则

1. Key kind 使用 `application_api_key`。
2. Key 绑定 `application_id`。
3. Key 绑定 `creator_user_id`。
4. 列表只返回当前 session 用户创建的 Key。
5. 删除只允许删除当前 session 用户创建的 Key。
6. 删除语义为 revoke：立刻不可用，列表不再显示，数据库保留审计引用。
7. 删除不支持恢复；误删后重新创建。
8. 创建数量不限制。
9. 完整 token 只在创建响应中返回一次。
10. 存储层只保存 hash、prefix 和必要审计字段。

### 8.3 API Key 校验

公开调用接收：

```http
Authorization: Bearer <application_api_key>
```

Anthropic 兼容路由额外接收：

```http
x-api-key: <application_api_key>
```

校验顺序：

1. 提取 token。
2. 校验 token hash。
3. 检查 key 未 revoke。
4. 检查 application 存在且 API enabled。
5. 检查 application 有 active published version。
6. 构造 public runtime actor。
7. 继续进入 Native run service。

## 9. Native API

### 9.1 路由

```http
POST /api/1flowbase/runs
GET /api/1flowbase/runs/{run_id}
POST /api/1flowbase/runs/{run_id}/resume
POST /api/1flowbase/runs/{run_id}/cancel
POST /api/1flowbase/files
```

所有路由都通过应用 API Key 鉴权。`run_id` 查询必须校验属于该 Key 绑定的应用。

### 9.2 Run request

```json
{
  "query": "用户当前这一轮问题",
  "model": "gpt-4o-mini",
  "inputs": {
    "customer_id": "c_123",
    "locale": "zh-CN"
  },
  "history": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "上一轮问题" }
      ]
    },
    {
      "role": "assistant",
      "content": [
        { "type": "text", "text": "上一轮回答" }
      ]
    }
  ],
  "attachments": [
    {
      "type": "image",
      "source": {
        "type": "upload_file_id",
        "file_id": "file_xxx"
      },
      "name": "invoice.png",
      "mime_type": "image/png"
    }
  ],
  "conversation": {
    "id": null,
    "user": "external-user-id",
    "mode": "auto"
  },
  "response_mode": "streaming",
  "stream_options": {
    "include_usage": true,
    "include_workflow_events": "none"
  },
  "execution": {
    "idempotency_key": "client-request-id",
    "trace_id": "external-trace-id",
    "timeout_ms": 120000
  },
  "metadata": {
    "source": "customer_portal"
  }
}
```

### 9.3 字段语义

| 字段 | 必填 | 语义 |
|---|---:|---|
| `query` | 是 | 当前这一轮用户输入，默认映射到 Start 主输入。 |
| `model` | 否 | 可选字符串输入。平台只校验类型，不校验值、不参与路由、不要求匹配公开 serving id；节点后续怎么使用由应用编排和 mapping 决定。 |
| `inputs` | 否 | 结构化业务变量，不放聊天正文。 |
| `history` | 否 | 调用方传入的外部上下文。 |
| `attachments` | 否 | 文件、图片、音频等输入资源。第一版稳定支持 `upload_file_id`。 |
| `conversation.id` | 否 | 外部可见会话 ID；可由调用方传入，也可由 1flowbase 返回。 |
| `conversation.user` | 否 | 外部终端用户 ID，用于会话、审计和日志。 |
| `conversation.mode` | 否 | `auto` 默认；有 id 则续会话，无 id 则创建或 stateless 执行。 |
| `response_mode` | 否 | `blocking` 或 `streaming`，默认 `blocking`。 |
| `stream_options.include_usage` | 否 | 是否在流式结束前输出 usage。 |
| `stream_options.include_workflow_events` | 否 | `none` 或 `public`；默认 `none`。 |
| `execution.idempotency_key` | 否 | 客户端幂等键，防止重试重复创建 run。 |
| `execution.trace_id` | 否 | 外部 trace id。 |
| `execution.timeout_ms` | 否 | 单次运行超时。 |
| `metadata` | 否 | 审计和业务透传，不参与路由。 |

### 9.4 会话规则

1. 如果调用方传 `conversation.id`，服务端按 `application_id + conversation.user + conversation.id` 绑定或续用内部 conversation。
2. 如果调用方不传 `conversation.id`，服务端可创建内部 conversation，并在响应中返回外部可续用 ID。
3. `history` 只表示本次请求携带的上下文，不直接替代服务端 conversation truth。
4. 相同 `conversation.id` 不能跨 application API Key 复用。

### 9.5 文件输入

第一版文件上传：

```http
POST /api/1flowbase/files
```

返回：

```json
{
  "id": "file_xxx",
  "name": "invoice.png",
  "mime_type": "image/png",
  "size": 12345
}
```

`attachments.source` 第一版稳定支持：

```json
{ "type": "upload_file_id", "file_id": "file_xxx" }
```

预留：

```json
{ "type": "url", "url": "https://example.com/a.png" }
{ "type": "base64", "data": "...", "mime_type": "image/png" }
```

兼容层收到 URL 或 base64 时，应优先转换成内部 file record，再进入 Native `attachments`。

## 10. Native Streaming

### 10.1 协议

Native streaming 使用 SSE。

默认只输出可被外部用户消费的文本增量和最终状态。工作流事件需要显式传：

```json
"stream_options": {
  "include_workflow_events": "public"
}
```

### 10.2 事件类型

第一版 Native SSE 事件：

```text
run.started
message.delta
workflow.event
required_action
usage.delta
run.completed
run.failed
run.cancelled
```

规则：

1. `message.delta` 承载 assistant 文本增量。
2. `workflow.event` 只输出 public 级别事件。
3. `required_action` 表示运行进入等待态。
4. `run.completed` 输出最终 answer、conversation、usage、attachments 和 run metadata。
5. `run.failed` 输出 Native 错误结构。

### 10.3 等待态与回调

工具、本地 agent、callback 节点和人类输入都应该在应用发布版本中配置好；调用方不在请求里传 OpenAI tools 定义。

当运行需要外部继续推进时，Native 返回等待态：

```json
{
  "run_id": "run_xxx",
  "status": "waiting_callback",
  "required_action": {
    "type": "submit_callback_result",
    "callback_task_id": "cb_xxx",
    "schema": {},
    "prompt": "需要外部系统提交结果"
  }
}
```

续跑：

```http
POST /api/1flowbase/runs/{run_id}/resume
```

```json
{
  "callback_task_id": "cb_xxx",
  "response": {},
  "response_mode": "streaming"
}
```

OpenAI / Anthropic 兼容接口第一版不支持等待态；遇到 waiting 返回对应协议的错误结构，并在文档说明调用方应改用 Native API。

## 11. OpenAI 兼容接口

### 11.1 路由

```http
POST /v1/chat/completions
```

鉴权：

```http
Authorization: Bearer <application_api_key>
```

### 11.2 输入映射

| OpenAI 字段 | Native 字段 |
|---|---|
| `messages` 最后一条 user text | `query` |
| `messages` 中此前内容 | `history` |
| image/file content parts | `attachments` |
| `stream` | `response_mode` |
| `user` | `conversation.user` |
| `metadata` | `metadata` |
| `model` | `model` |

第一版不支持：

1. `tools`
2. `tool_choice`
3. `function_call`
4. audio output
5. multimodal generation

遇到 unsupported feature 返回 OpenAI 标准 error object，`type` 使用 `invalid_request_error`，`code` 使用 `unsupported_feature`。

### 11.3 输出映射

Blocking 输出模拟 OpenAI chat completion object。

Streaming 输出模拟 OpenAI chat completion chunk。

兼容层只输出标准 OpenAI chunk，不输出 Native `workflow.event`。

## 12. Anthropic 兼容接口

### 12.1 路由

```http
POST /v1/messages
```

鉴权：

```http
Authorization: Bearer <application_api_key>
x-api-key: <application_api_key>
```

### 12.2 输入映射

| Anthropic 字段 | Native 字段 |
|---|---|
| `system` | `history` system context |
| `messages` 最后一条 user text | `query` |
| `messages` 中此前内容 | `history` |
| content blocks | `attachments` |
| `stream` | `response_mode` |
| `metadata.user_id` | `conversation.user` |
| `model` | `model` |

第一版不支持：

1. `tools`
2. `tool_choice`
3. tool result blocks
4. computer use

遇到 unsupported feature 返回 Anthropic 标准 error object，`type` 使用 `invalid_request_error`，`error.type` 使用 `unsupported_feature`。

### 12.3 输出映射

Blocking 输出模拟 Anthropic message object。

Streaming 输出模拟 Anthropic event stream。

兼容层只输出 Anthropic 标准事件，不输出 Native `workflow.event`。

## 13. Mapping 配置

每个应用需要最小 API mapping，用于 Native 输出和兼容协议输出。

第一版字段：

```json
{
  "input": {
    "model_target": "start.model",
    "query_target": "start.query",
    "inputs_target": "start.inputs",
    "history_target": "start.history",
    "attachments_target": "start.attachments"
  },
  "output": {
    "answer_selector": "answer.answer",
    "usage_selector": "llm.usage",
    "files_selector": null,
    "error_selector": null
  }
}
```

规则：

1. 未配置时按默认 `answer/text/output` 自动寻找 answer。
2. Mapping 保存到应用发布快照；公开运行使用 published mapping，不读编辑态 mapping。
3. Mapping UI 在应用 API tab 内提供最小编辑能力。
4. Mapping 配置错误会阻止发布，不能等到公开调用时才失败。
5. `model_target` 可为空；为空时 Native `model` 只保留在 run request / metadata 中，不自动注入节点输入。

## 14. 应用详情 API Tab

### 14.1 信息架构

应用详情 API tab 分为：

```text
API
  [API Keys] [Native API] [OpenAI Compatible] [Anthropic Compatible] [Mapping]
```

### 14.2 API Keys

展示当前用户创建的 Key：

1. name。
2. prefix。
3. created_at。
4. last_used_at 可后续加入；第一版不是必须。
5. 创建按钮。
6. 删除按钮。

创建后弹窗展示完整 token 一次，并提示后续不可再查看。

### 14.3 API Docs

复用现有 Settings docs 的能力，但需要抽象成共享组件：

1. catalog / operations / operation spec 数据源可注入。
2. base server URL 可注入。
3. authentication config 可注入。
4. category tab 可由父组件控制。
5. 应用 API tab 内不跳转到 settings docs。

### 14.4 在线调试

应用 API tab 可以提供在线调试：

1. 用户手动填入 Key 或使用刚创建后临时内存中的 Key。
2. 前端不长期保存完整 Key。
3. Native API 可编辑 `query/inputs/history/attachments/response_mode`。
4. 兼容协议 tabs 展示对应 request 示例和 streaming 示例。

## 15. OpenAPI 文档

Docs registry 需要新增应用公开 API 分类：

1. `Application Native API`
2. `OpenAI Compatible API`
3. `Anthropic Compatible API`

应用详情内文档需要根据当前应用生成说明：

1. 当前应用名称。
2. 当前 API status。
3. 当前 active published version。
4. 当前 mapping summary。
5. Unsupported features。

公开 API 文档必须明确：

1. Key 调用只走已发布版本。
2. 外部 URL 不包含 `application_id`。
3. OpenAI / Anthropic 兼容接口由 Key 绑定的应用决定路由。
4. 不兼容能力应改用 Native API 或后续插件扩展。

## 16. 错误结构

### 16.1 Native error

Native API 统一错误：

```json
{
  "error": {
    "type": "unsupported_feature",
    "code": "unsupported_feature",
    "message": "OpenAI tools are not supported by this compatible endpoint. Use Native API required_action instead.",
    "param": "tools"
  }
}
```

### 16.2 OpenAI compatible error

```json
{
  "error": {
    "message": "tools is not supported by this endpoint",
    "type": "invalid_request_error",
    "param": "tools",
    "code": "unsupported_feature"
  }
}
```

### 16.3 Anthropic compatible error

```json
{
  "type": "error",
  "error": {
    "type": "unsupported_feature",
    "message": "tools is not supported by this endpoint"
  }
}
```

兼容层错误结构应尽量严格模拟第三方协议，避免 SDK 无法识别。

## 17. 状态与审计

公开 run 需要进入现有 application logs，但 run mode 应与 debug 分开。

建议新增 run mode：

```text
published_api_run
```

状态：

```text
queued
running
waiting_callback
waiting_human
succeeded
failed
cancelled
```

审计至少记录：

1. api_key_id。
2. application_id。
3. active published version id。
4. creator_user_id。
5. external user。
6. conversation id。
7. trace id。
8. response mode。
9. compatibility mode：`native/openai/anthropic`。

## 18. 测试与验收证据

设计验收时需要覆盖：

1. 创建应用 API Key 只返回一次完整 token。
2. 列表只展示当前用户创建的 Key。
3. 删除后 token 立刻不可用。
4. `/api/1flowbase/runs` 不接受没有 active published version 的应用。
5. Native blocking run 返回最终结果。
6. Native streaming run 输出 SSE delta 和 terminal event。
7. Native waiting run 返回 required_action，resume 能继续。
8. OpenAI `/v1/chat/completions` blocking 返回兼容 response。
9. OpenAI streaming 返回兼容 chunk。
10. Anthropic `/v1/messages` blocking 返回兼容 response。
11. Anthropic streaming 返回兼容 event stream。
12. unsupported tools 返回协议对应错误结构。
13. 应用 API tab 能展示 Key、Native docs、OpenAI docs、Anthropic docs、Mapping。
14. 应用 API tab 不跳转全局 settings docs。

## 19. 实现拆分建议

后续 implementation plan 建议拆为：

1. 应用发布版本与 API Key domain/storage。
2. Native run service 与公开 route。
3. Native SSE streaming 与 waiting/resume。
4. OpenAI / Anthropic compatibility adapters。
5. OpenAPI docs registry 与应用 API docs component 抽象。
6. 应用 API tab UI 与 mapping UI。
7. 端到端测试、docs 验证和回归。

## 20. 自检

1. 本设计没有把 `application_id` 放入外部调用 URL。
2. 本设计固定 Key 调用已发布版本，不调用编辑草稿。
3. 本设计没有把 OpenAI / Anthropic 字段直接作为核心运行模型。
4. 本设计覆盖了 query、model、history、inputs、attachments、conversation、streaming、required action 和 mapping。
5. 本设计明确第一版 unsupported features 与后续扩展边界。
6. 本设计保留 Root 通过其他方式查审计，不在应用 API Key 列表加特殊查看权限。
