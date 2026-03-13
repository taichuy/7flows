# 2026-03-14 Native Published SSE Replay

## 背景

最近几轮开发已经把 publish binding、native async invoke、OpenAI / Anthropic 非流式入口，以及 replay-style protocol SSE 衔接起来，但原生发布接口仍停留在一次性 JSON 返回。

结合 `docs/dev/runtime-foundation.md` 当前 P0，下一步不应该跳去更重的 runtime 语义改造，而应继续沿 `API 调用开放` 主线补齐现有发布面，让 native / protocol 入口都能挂在同一条 publish binding + lifecycle + audit 链路上继续演进。

## 目标

- 为 native published endpoint 增加最小 replay-style SSE 能力。
- 继续复用现有 publish binding、runtime 执行和 invocation audit，而不是为 native stream 单独发明第二套执行返回结构。
- 让 native stream 与 protocol stream 一样受 binding `streaming` 开关约束，保持发布层治理边界一致。

## 实现方式

1. 在 `PublishedNativeRunRequest` 增加 `stream` 字段。
2. 在 `api/app/services/published_gateway.py` 的 native sync invoke 入口补 `require_streaming_enabled` 参数，并复用 `_invoke_binding` 的统一 streaming guardrail。
3. 在 `api/app/services/published_protocol_streaming.py` 增加 `build_native_run_stream()`，输出最小 `run.started / run.output.delta / run.completed` SSE 事件。
4. 在 `api/app/api/routes/published_gateway.py` 中让 native sync 三条入口在 `stream=true` 时返回 `text/event-stream`，继续透出 `X-7Flows-Cache` 与 `X-7Flows-Run-Status` 响应头。
5. 为成功流式返回与 `streaming_unsupported` 拒绝补充回归测试。

## 影响范围

- `api/app/schemas/workflow_publish.py`
- `api/app/services/published_gateway.py`
- `api/app/services/published_protocol_streaming.py`
- `api/app/api/routes/published_gateway.py`
- `api/tests/test_workflow_publish_routes.py`
- `docs/dev/runtime-foundation.md`

## 验证方式

- 在 `api/` 下执行：`./.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_routes.py -q`
- 重点验证：
  - native sync endpoint 在 `streaming=true + stream=true` 时返回 `text/event-stream`
  - native stream 仍记录真实 `run_id / run_status`
  - `stream=false` 的 binding 请求 native stream 时，会稳定落到 `streaming_unsupported` 审计原因

## 当前边界

- 当前 native SSE 仍是 replay-style，尚未直接消费 `run_events` 实时增量。
- waiting run 仍不应通过挂起一个长期 SSE 请求来冒充 durable async lifecycle；这部分仍应继续沿 async invoke / callback ticket / waiting drilldown 主线推进。
- `api/app/services/published_gateway.py` 仍然偏大；随着 native/protocol streaming 和 governance 继续增加，后续应按 surface / mapper / audit 拆分。

## 下一步

1. 优先把 `run_events -> native / protocol delta` 做成统一实时/准实时映射。
2. 继续补 waiting / async lifecycle detail 与 invocation drilldown。
3. 继续治理 `published_gateway.py` 与 `published_invocations.py` 体量，避免 publish 主线再次形成新的 God object。
