---
memory_type: feedback
feedback_category: repository
topic: AgentFlow LLM stream and extracted output payload ownership
summary: Raw LLM stream process events should be materialized into node_runs.debug_payload without automatic slicing or transformation; reasoning content extracted from the stream is output-derived content and belongs with node output storage; runtime metrics must stay in metrics_payload and not pollute persisted output_payload.
keywords:
  - agent-flow
  - llm
  - stream
  - debug_payload
  - data processing
match_when:
  - Debugging or changing AgentFlow LLM streaming, node last-run data processing, runtime events, or output/cache projection.
created_at: 2026-05-08 16
updated_at: 2026-05-08 16
last_verified_at: 无
decision_policy: direct_reference
scope:
  - api/crates/control-plane/src/orchestration_runtime
  - api/crates/orchestration-runtime
  - web/app/src/features/agent-flow
---

# AgentFlow LLM Stream Process Payload Ownership

## 时间

`2026-05-08 16`

## 规则

LLM 原始流式过程事件应在后端原样物化到 `node_runs.debug_payload`，作为节点 Last Run “数据处理”的权威快照。`debug_payload` 保留原始数据，不自动切片、解析、提取或重组。流式提取后的思考内容属于输出派生内容，应跟节点输出存储边界走，不放入“数据处理”桶。`metrics_payload` 是指标桶，`attempts`、`event_count`、provider code、usage 等运行指标不能污染持久化 `output_payload`。前端不应把 `runtime_events`、`flow_run_events` 或实时流事件当作 canonical source 临时拼出“数据处理”。

## 原因

`output_payload` 是节点输出与后续变量缓存来源；`debug_payload` 是原始过程数据边界；`metrics_payload` 是运行指标边界。思考内容已经从流式事件中提取并结构化，语义上不再是 provider 原始过程事件。若在 `debug_payload` 里自动切片或派生，会破坏“原始事实快照”的含义；若 metrics 泄漏到 `output_payload`，大 JSON 会被 artifact 预览折叠成 `preview/artifact_ref`，导致节点输出看起来像“数据处理/指标返回值”，破坏三段边界；若前端自行从事件账本拼过程数据，会让同一节点运行的过程快照缺少稳定后端事实来源，也会让 Last Run 展示与持久化节点记录脱节。

## 适用场景

- LLM 节点流式返回、provider events、tool calls、MCP calls 的过程持久化与展示。
- LLM 节点思考内容从流式事件中提取后的输出存储与展示。
- LLM 节点 metrics、usage、attempts、provider route 的持久化与展示。
- 节点 Last Run 的“输入 / 数据处理 / 输出”三段数据边界。
- runtime event ledger 与 node run debug snapshot 的职责划分。

## 备注

`runtime_events` / `flow_run_events` 可以继续作为事件账本或实时/审计流存在，但 Last Run 的“数据处理”应依赖 `node_runs.debug_payload` 中的原始过程快照，不对该快照自动切片加工；思考内容应作为输出结构的一部分由输出节点记录承载。
