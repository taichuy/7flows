# Agent Flow Debug Stream Runtime Events Spec

Status: Draft
Date: 2026-05-08
Owner: Agent Flow / Runtime

## Goal

完善 Agent Flow 预览调试流：

- 预览生成中可以直接终止。
- 实时预览继续走低延迟 best-effort 通道。
- 历史调试流统一从 `runtime_events` 读取。
- 运行期缓存丢失可接受，历史数据能写多少算多少。
- 不做旧流式逻辑兼容，不让 `flow_run_events` 继续承担 debug stream 历史真值。

## Non-Goals

- 不做 durable stream / outbox。
- 不做跨进程可靠 replay。
- 不做底座级缓存中间件。
- 不要求每个 token / chunk 都同步落库。
- 不要求 `RuntimeEventStream` 丢失后从数据库无缝续接实时 SSE。
- 不保留 `flow_run_events` 作为 debug stream 历史来源。

## Source Of Truth

```text
runtime_events
  debug stream history truth
  text_delta / reasoning_delta
  node lifecycle events
  flow terminal events
  tool / usage / diagnostic events

RuntimeEventStream
  runtime-only best-effort transport
  memory / middleware-backed implementation point
  SSE preview source while the run is active

flow_runs / node_runs
  terminal state truth
  input / output / error / metrics truth

flow_run_events
  not used by the new debug stream
  no new stream-body dependency
```

## Target Architecture

```text
                 +--------------------------+
                 | Provider / Runtime Engine |
                 +------------+-------------+
                              |
                              v
                    ProviderStreamEvent
                              |
             +----------------+----------------+
             |                                 |
             v                                 v
   +--------------------+          +--------------------------+
   | RuntimeEventStream |          | RuntimeEventsPersister   |
   | best effort cache  |          | writes runtime_events    |
   +---------+----------+          +------------+-------------+
             |                                  |
             v                                  v
       +-----------+                    +---------------+
       | SSE UI    |                    | runtime_events|
       | realtime  |                    | history truth |
       +-----------+                    +-------+-------+
                                                |
                                                v
                                 +-----------------------------+
                                 | /logs/runs/:run_id/debug... |
                                 | historical debug stream     |
                                 +-----------------------------+
```

## Runtime States

Preview session status:

```text
idle
  |
  | submit
  v
running
  |
  | stop
  v
stopping
  |
  | cancel success
  v
cancelled

running
  |
  | terminal event or detail result
  v
completed / failed / waiting_human / waiting_callback
```

`stopping` is a UI/client guard state. Durable truth remains `flow_runs.status`.

## Preview Stop UX

```text
Idle / terminal composer:

+-----------------------------------+
| 和 Bot 聊天                       |
|                              +--+ |
|                              |↑ | |
|                              +--+ |
+-----------------------------------+

Running composer:

+-----------------------------------+
| 正在生成...                       |
|                              +--+ |
|                              |■ | |
|                              +--+ |
+-----------------------------------+
```

Rules:

- `running` / `waiting_human` / `waiting_callback` can expose stop when there is an active run id.
- Stop button calls `debugSession.stopRun()`.
- Stop button is disabled while `stopping`.
- Repeated clicks must not send duplicate cancel requests.
- After cancel returns, input becomes editable and send button returns.
- If cancel request fails, keep the session state from the last known run detail and show a non-raw user-facing error.

## Cancel Flow

```text
User clicks stop
      |
      v
debugSession.stopRun()
      |
      v
POST /api/console/applications/:id/orchestration/runs/:run_id/cancel
      |
      v
cancel_flow_run
      |
      +--> flow_runs.status = cancelled
      |
      +--> append flow_cancelled -> RuntimeEventStream
      |
      +--> RuntimeEventsPersister best-effort writes runtime_events
      |
      v
UI status = cancelled
```

Minimum guarantee:

- `flow_runs.status = cancelled`.
- Preview UI exits running/stopping state.
- `runtime_events` receives `flow_cancelled` on a best-effort basis.

## Persistence Model

All new debug stream persistence writes to `runtime_events`.

```text
RuntimeEventEnvelope
      |
      | persist_required = false
      |   drop
      v
RuntimeEventsPersister
      |
      +-- text_delta / reasoning_delta
      |     coalesce
      |
      +-- node_started / node_finished
      |     flush pending delta first
      |
      +-- flow_started / flow_finished / flow_failed / flow_cancelled
      |     flush pending delta first
      |
      +-- tool / usage / callback / diagnostic
            flush pending delta first
      |
      v
append_runtime_events(...)
```

### Delta Coalescing

Coalesce `text_delta` and `reasoning_delta` by:

- same `flow_run_id`
- same `node_run_id`
- same `event_type`
- consecutive stream order

Flush when:

- event type changes
- node run changes
- terminal event arrives
- pending text exceeds `4096` bytes
- pending text has waited `250ms`
- stream closes

Stored payload fields:

```json
{
  "type": "text_delta",
  "event_type": "text_delta",
  "node_run_id": "uuid",
  "node_id": "node-llm",
  "text": "merged text",
  "content_type": "text",
  "sequence_start": 10,
  "sequence_end": 18,
  "event_ids": ["run:10", "run:11"],
  "truncated": false,
  "truncation": {
    "truncated": false,
    "reason": null,
    "original_bytes": 11,
    "stored_bytes": 11
  },
  "content_refs": [],
  "artifact_refs": [],
  "refs": {
    "content": [],
    "artifacts": []
  }
}
```

### Runtime Event Classification

Recommended write classification:

```text
text_delta / reasoning_delta
  layer: runtime_item
  source: host
  visibility: workspace
  durability: durable

node_started / node_finished
  layer: runtime_item
  source: runtime
  visibility: workspace
  durability: durable

flow_started / flow_finished / flow_failed / flow_cancelled
  layer: agent_transition
  source: runtime
  visibility: workspace
  durability: durable

tool_call_commit / tool_result_appended / capability_call_*
  layer: capability
  source: host
  visibility: workspace
  durability: durable

usage_snapshot / usage_recorded / cost_recorded
  layer: ledger
  source: host
  visibility: workspace
  durability: durable
```

Provider raw events may still be recorded in `runtime_events` for observability, but the default debug stream read model must not duplicate provider raw text with user-facing debug stream text.

## Read Model

`GET /api/console/applications/:id/logs/runs/:run_id/debug-stream` reads only `runtime_events`.

```text
list_runtime_events(run_id, after_sequence = 0)
      |
      v
fold_event_to_debug_part()
      |
      v
RuntimeDebugStreamResponse
```

Default read filter:

```text
include:
  runtime_item
  agent_transition
  capability
  ledger
  diagnostic

exclude by default:
  provider_raw
```

Debug part mapping:

```text
text_delta        -> text
reasoning_delta   -> reasoning
tool_*            -> tool_input / tool_output
usage_*           -> usage_snapshot
flow_cancelled    -> status
flow_failed       -> error
flow_finished     -> status
node_*            -> trace
```

## File-Level Implementation Targets

Frontend:

- `web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx`
  - Add stop button mode and stopping guard.
- `web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx`
  - Pass `onStopRun` and running/stopping state.
- `web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx`
  - Expose `onStopRun`.
- `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - Bind `debugSession.stopRun()`.
- `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
  - Add client-side stopping guard if needed.

Backend:

- `api/apps/api-server/src/routes/applications/application_runtime.rs`
  - Keep cancel endpoint.
  - Route stream persister to runtime event writes.
- `api/crates/control-plane/src/orchestration_runtime/debug_event_persister.rs`
  - Replace with or rename to runtime events persister.
  - Persist to `runtime_events`, not `flow_run_events`.
- `api/crates/control-plane/src/runtime_observability/debug_read_model.rs`
  - Fold `runtime_events` into historical debug stream parts.
- `api/crates/storage-durable/postgres/src/orchestration_runtime_repository/event_methods.rs`
  - Reuse `append_runtime_events`.

## Test Requirements

Frontend:

```text
DebugComposer
  running shows stop button
  idle shows send button
  stop click calls onStop
  repeated stop click is guarded

useAgentFlowDebugSession
  stopRun calls cancelFlowDebugRun with active run id
  stopRun changes status to cancelled after API result
  stopRun aborts active stream and polling
```

Backend:

```text
RuntimeEventsPersister
  coalesces text_delta into runtime_events
  coalesces reasoning_delta separately from text_delta
  flushes pending delta before flow_cancelled
  flushes pending delta before flow_finished
  drops persist_required=false
  does not write debug stream body to flow_run_events

Debug stream read model
  reads runtime_events only
  maps text_delta to text part
  maps reasoning_delta to reasoning part
  maps flow_cancelled to status part
  excludes provider_raw by default

Cancel route
  updates flow_runs.status to cancelled
  emits flow_cancelled runtime event best-effort
```

## Acceptance Criteria

- User can stop a running preview from the composer.
- Stop does not create duplicate cancel requests.
- Cancelled run has `flow_runs.status = cancelled`.
- Historical debug stream reads only from `runtime_events`.
- New stream text persistence no longer depends on `flow_run_events`.
- `runtime_events` contains coalesced text and reasoning entries.
- Terminal events are visible in historical debug stream when they were persisted.
- Cache loss during runtime does not block run completion or cancel completion.

## Migration Stance

This feature is still in active development. Do not preserve old stream-history behavior.

Allowed:

- Remove new debug stream dependencies on `flow_run_events`.
- Change tests to assert `runtime_events` as the only historical debug stream source.
- Simplify or delete code whose only purpose is preserving old debug stream persistence semantics.

Not allowed:

- Introduce a compatibility read path that merges `flow_run_events` and `runtime_events`.
- Make runtime SSE depend on successful database writes.
- Add durable stream infrastructure in core for this milestone.
