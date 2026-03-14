# 2026-03-14 Protocol Run Event Streaming

## 背景

- `c2c3619 feat: replay native published sse from run events` 已经把原生 published SSE 的事实来源开始收口到 `RunDetail.events`。
- 但 OpenAI / Anthropic 的同步流式接口仍然只是基于最终响应文本做 chunk replay，还没有优先复用同一份运行态事实。
- 这会让三条 publish surface 的流式拼装逻辑继续分叉，也不利于后续统一推进 `run_events -> protocol delta`。

## 目标

- 让 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages 的 replay-style SSE 在可用时优先消费 `run.events`。
- 保持当前 MVP 诚实边界：仍然是 replay-style，不假装已经支持 token 级实时流或 waiting run 的长连接承接。
- 不改变现有对外协议响应结构，不新增第二套运行态存储。

## 实现方式

- 在 `api/app/services/published_gateway.py` 为 `PublishedGatewayInvokeResult` 增加 `run_payload`，让 publish route 在不污染协议响应体的前提下拿到本次执行对应的 `RunDetail`。
- 对 cache hit 保持兼容：
  - 若 response 自带 `run`，继续直接复用；
  - 若是协议 sync cache hit 且没有 `run` envelope，则继续退回响应文本重放。
- 在 `api/app/services/published_protocol_streaming.py` 新增协议流式文本解析逻辑：
  - 若 `run.events` 中已有 `node.output.delta` / `run.output.delta`，优先拼接这些 delta；
  - 否则回退到最后一个 `node.output.completed`，再回退到 `run.completed.output`；
  - 若仍然不可用，再退回现有 response payload 中的最终文本。
- `api/app/api/routes/published_gateway.py` 的 OpenAI / Anthropic sync stream 路由改为显式把 `result.run_payload` 传给 stream builder。

## 影响范围

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`
- `api/app/services/published_gateway.py`
- `api/app/services/published_protocol_streaming.py`

## 验证

- `api/.venv/Scripts/uv.exe run pytest tests/test_published_protocol_streaming.py -q`
- `api/.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_routes.py -q`
- `api/.venv/Scripts/uv.exe run pytest tests/test_published_protocol_async_routes.py tests/test_workflow_publish_activity.py -q`

## 当前结论

- 现在 native / openai / anthropic 三条 sync streaming surface 都已经开始复用统一运行事实，只是协议映射层次不同：
  - native 直接回放 `RunDetail.events`
  - openai / anthropic 先从 `run.events` 提取可用输出，再映射成各自协议事件
- 这仍然不是实时流，而是“执行完成后的事实重放”；但它已经比单纯依赖最终响应文本更接近统一事件流主线。

## 下一步

1. 在 runtime 中补真实 `node.output.delta`，减少 publish 层自行 chunk 最终文本的时间。
2. 继续把 protocol streaming 的事件映射收口到更统一的 mapper，避免 native/openai/anthropic 分别维护细碎规则。
3. 继续深化 publish governance，让 invocation detail 能更稳定钻取到 `run / callback ticket / cache`。
