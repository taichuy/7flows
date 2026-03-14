# 2026-03-14 Published Gateway Invocation Recorder Split

## 背景

- 最近提交 `0b4542d refactor: split published gateway response builders` 已经把 response builder 从 `api/app/services/published_gateway.py` 中拆出，说明发布治理主线仍在沿结构边界持续收口。
- 但 `PublishedEndpointGatewayService` 仍内嵌 invocation 成功/失败记录逻辑，主执行链路依然同时承担执行编排与审计落库职责。
- 这与 `docs/dev/runtime-foundation.md` 中上一轮写明的 P0 一致，因此本轮继续承接该优先级，而不是扩散到新的功能面。

## 目标

- 把 publish gateway 中的 invocation audit handoff 再拆一层。
- 保持发布 API 契约、缓存策略、运行时执行语义不变。
- 继续降低 `published_gateway.py` 的职责密度，为后续拆 protocol surface / cache orchestration 留出空间。

## 实现

- 新增 `api/app/services/published_gateway_invocation_recorder.py`：
  - `PublishedGatewayInvocationContext`
  - `PublishedGatewayInvocationSuccess`
  - `PublishedGatewayInvocationRecorder`
- `PublishedEndpointGatewayService` 现通过注入 recorder 处理两类记录动作：
  - invocation rejection / failed 记录
  - invocation success / run-linked 记录
- `published_gateway.py` 保留执行编排与响应装配主链路，不再直接拼装 `record_invocation(...)` 的长参数列表。

## 影响范围

- `api/app/services/published_gateway.py`
- `api/app/services/published_gateway_invocation_recorder.py`

## 验证

- `./.venv/Scripts/uv.exe run pytest tests/test_workflow_publish_routes.py tests/test_published_native_async_routes.py tests/test_published_protocol_async_routes.py -q`
- 结果：`29 passed`

## 判断

- 当前基础框架已经能继续推进产品完整度，仍不属于“只剩界面设计”的阶段。
- 架构解耦方向正确，且发布治理链路在连续收口；不过以下文件仍是明显结构热点：
  - `api/app/services/runtime.py`
  - `api/app/services/published_invocation_audit.py`
  - `web/components/run-diagnostics-panel.tsx`
- 主要功能业务仍可持续推进，并且与产品设计目标一致：发布治理、运行追溯、调试入口和节点配置完整度都还有明确可落地增量。

## 下一步

1. **P0：继续拆 `api/app/services/published_gateway.py`**
   - 优先继续抽离 protocol surface / binding resolution / cache orchestration，避免主服务再次膨胀。
2. **P1：补流式 `stream_options.include_usage` 支持**
   - 让 `AICallRecord` 和成本分析拿到完整 usage 数据。
3. **P1：治理剩余结构热点**
   - 优先 `api/app/services/runtime.py`
   - 然后 `api/app/services/published_invocation_audit.py`
   - 再到 `web/components/run-diagnostics-panel.tsx`
4. **P1：继续补节点配置完整度**
   - 把 provider / model / 参数配置收敛成更结构化的交互层。
