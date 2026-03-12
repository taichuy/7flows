# 2026-03-12 Published Protocol Async Bridge

## 背景

上一轮已经把 `native` published endpoint 补到了 `run-async`，能让 durable waiting workflow 通过发布态入口返回 `202 + RunDetail`。

但 `OpenAI / Anthropic` 协议面仍只有同步入口：

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`

这导致 protocol surface 一旦命中 `run.status=waiting`，只能回到同步边界上的 `409`，而无法继续沿 publish binding + compiled blueprint + invocation audit 这条主线前进。

## 目标

- 在不伪装成已支持标准 SSE 的前提下，把 protocol surface 也接到 durable waiting 链路。
- 继续复用现有 `publish binding -> compiled blueprint -> runtime -> invocation audit -> cache governance`，而不是为协议层再起一套执行分支。
- 保持开放 API 的 MVP 诚实性：这是一层 async bridge，不是完整的 OpenAI / Anthropic streaming 实现。

## 本轮实现

### 1. 新增 protocol async 入口

新增三个显式 async 入口：

- `POST /v1/chat/completions-async`
- `POST /v1/responses-async`
- `POST /v1/messages-async`

它们继续通过 `model -> published endpoint alias` 命中 active binding，并复用既有：

- `workflow_version + compiled_blueprint`
- `PublishedEndpointGatewayService`
- `RuntimeService.execute_compiled_workflow()`
- `workflow_published_invocations`

### 2. 返回诚实的 async envelope

为避免伪装成已经具备标准流式协议，本轮没有把 async 结果伪装成 OpenAI / Anthropic 原生 SSE，而是新增统一 envelope：

- `binding_id / endpoint_id / endpoint_alias / route_path`
- `protocol / request_surface / model`
- `workflow_id / workflow_version / compiled_blueprint_id`
- `run: RunDetail`
- `response_payload`

其中：

- `run.status=succeeded` 时，`response_payload` 包含已映射的最小协议响应体
- `run.status=waiting` 时，返回 `202`，并显式不返回最终协议结果

### 3. async surface 接入治理与缓存

本轮把新的 request surface 纳入 published invocation audit：

- `openai.chat.completions.async`
- `openai.responses.async`
- `anthropic.messages.async`

同时把缓存策略继续保持诚实边界：

- async completed response 可以进入 publish cache
- async waiting response 不进入 cache
- waiting response 会返回 `X-7Flows-Cache: BYPASS`
- 所有 async protocol 入口都会补 `X-7Flows-Run-Status`

### 4. invocation audit 继续绑定 run facts

之前 invocation audit 对 `run_id / run_status` 的回填主要偏向 native route。

本轮统一为“只要 response payload 里存在 `run`，就继续回填”：

- `run_id`
- `run_status`
- `error_message`

这样 protocol async route 进入 waiting / failed 时，也能在治理页里直接看到 durable runtime 的状态，而不是只剩协议层请求摘要。

## 影响范围

- 后端发布网关与 schema
- published invocation audit request surface 分类
- workflow 页发布治理面板的 surface 展示与筛选枚举
- async 协议桥接测试边界

## 验证

在 `api/.venv` 中执行：

```powershell
.\.venv\Scripts\uv.exe run pytest tests\test_published_protocol_async_routes.py tests\test_published_native_async_routes.py tests\test_workflow_publish_routes.py
```

结果：

- `23 passed`

本轮新增覆盖：

- OpenAI chat async completed + cache hit/miss
- OpenAI responses async waiting + no cache reuse
- Anthropic messages async waiting + no cache reuse
- invocation audit 的 async request surface 与 waiting run status

## 当前结论

- 上一次提交 `feat: harden published native async governance` 需要衔接，这一轮已经沿同一主线把 async 能力从 native 入口继续推进到 protocol surface。
- 当前仍然不是完整的 OpenAI / Anthropic async/streaming 实现；它只是 durable waiting 到协议层的桥接层。
- 这条桥接层的价值在于：后续补 SSE 时，可以继续挂在同一条 publish binding + run events + invocation audit 链路上，而不是推翻已有发布治理。

## 下一步

1. 继续把 protocol async bridge 往统一事件流推进，为 SSE 做铺垫，而不是单独扩另一套 streaming 状态。
2. 把 publish governance 继续补到“sync / async / waiting / streaming request”统一可见。
3. 继续控制测试与 service 文件体量，避免 publish gateway 与 publish audit 成为新的大包。
