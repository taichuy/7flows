# 2026-03-13 Published Protocol SSE Replay

## 背景

- 本轮先按 `AGENTS.md` 要求复核了仓库现状、产品设计、技术补充与 `runtime-foundation`。
- 上一次 Git 提交 `ba2199e` 刚完成 `runtime node execution support` 结构解耦，属于为 `streaming / SSE` 主线清理阻力的承接动作。
- 结合 `docs/dev/runtime-foundation.md` 的既有优先级，当前最应该继续的不是再拆 runtime 语义，而是把 publish binding 从“只有 sync/async envelope”推进到“具备可消费的 SSE 接口”。

## 目标

1. 为 OpenAI / Anthropic 发布入口补上最小可消费的 SSE。
2. 保持 `runs / node_runs / run_events` 作为事实源，不额外引入第二套运行时存储。
3. 顺手补齐协议同步调用在 publish audit 中缺失 `run_id / run_status` 的追踪问题。

## 实现方式

### 1. 新增独立协议流式 mapper

- 新增 `api/app/services/published_protocol_streaming.py`。
- 该文件负责把最小协议返回体映射成：
  - OpenAI Chat Completions SSE
  - OpenAI Responses SSE
  - Anthropic Messages event stream
- 这样避免把协议事件组装逻辑继续堆到 `api/app/api/routes/published_gateway.py` 或 `api/app/services/published_gateway.py`。

### 2. 发布网关支持 binding 级 streaming 开关

- `api/app/services/published_gateway.py` 现在支持显式要求 `require_streaming_enabled=True`。
- 当 binding 没声明 `streaming=true` 时，请求 `stream=true` 会被明确拒绝，而不是像之前一样全局把所有 stream 请求都视为“暂未支持”。
- 对于声明了 `streaming=true` 的 binding，sync 协议入口现在可以正常执行并返回 SSE。

### 3. 保持 MVP 诚实边界

- 当前 SSE 是 replay-style：先完成 workflow 运行，再将最终输出按最小协议事件集重放为 `text/event-stream`。
- 这不是 token 级实时流，也不是完整协议覆盖。
- waiting / callback / durable resume 仍应走已有 async bridge，而不是假装一个长连接就能承接 durable waiting。

### 4. 修复 publish audit 的 run 追踪缺口

- 之前协议同步调用的响应体不带 `run` envelope，导致 `workflow_published_invocations` 常拿不到 `run_id / run_status`。
- 现在 `PublishedEndpointGatewayService` 会在协议同步调用执行成功后，把实际 runtime 产生的 `run_id / run_status` 一并写入 invocation audit。
- 这样 publish governance 可以继续沿统一事实链路追到真实运行，而不需要补第二条旁路接口。

## 影响范围

- `api/app/api/routes/published_gateway.py`
- `api/app/services/published_gateway.py`
- `api/app/services/published_invocations.py`
- `api/app/services/published_protocol_streaming.py`
- `api/tests/test_workflow_publish_routes.py`
- `docs/dev/runtime-foundation.md`

## 验证

- 在 `api/` 下通过现有 `.venv` + `uv` 执行：
  - `./.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_routes.py -q`
  - `./.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_activity.py tests/test_published_protocol_async_routes.py -q`
- 结果：
  - `21 passed`
  - `7 passed`

## 当前结论

- 项目基础框架已经搭到“可继续推进主业务完整度”的阶段：runtime、publish binding、publish governance、async waiting bridge、前端工作台骨架都已存在，不再是只有方向没有落地的状态。
- 但距离产品设计要求的“统一事件流驱动的流式、调试、回放、发布”仍有差距；这轮只是把 publish protocol stream 从 0 补到了 MVP 可用。
- 架构上目前总体仍是分层可推进的，尤其是 runtime 与 publish surface 都开始沿 support/mixin/mapper 拆分；不过 `api/app/services/published_gateway.py`、`api/app/services/workflow_library.py`、`web/components/run-diagnostics-panel.tsx`、`web/components/workflow-editor-workbench.tsx` 仍是明显热点，后续需要继续控制体量。

## 下一步

1. 把 replay-style SSE 继续演进到 `run_events -> protocol delta` 的实时/准实时映射。
2. 补 native publish / run event stream，让原生接口和协议接口更一致地复用统一事件流。
3. 深化 publish governance drilldown，补齐 waiting / callback / cache / run 的追踪闭环。
