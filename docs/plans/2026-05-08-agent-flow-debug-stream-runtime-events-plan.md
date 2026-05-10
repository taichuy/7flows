# Agent Flow Debug Stream Runtime Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the new debug stream model where preview runs can be stopped from the UI and historical debug stream data is persisted and read from `runtime_events`.

**Architecture:** `RuntimeEventStream` remains the best-effort active-run transport for SSE. `runtime_events` becomes the only durable read model for debug stream history. `flow_run_events` is not used for new debug stream history or stream body persistence.

**Tech Stack:** React, Ant Design, TanStack Query, Vitest, Rust, Axum, SQLx/PostgreSQL repository traits, 1flowbase control-plane runtime.

---

## Spec

Primary design document:

- `docs/specs/2026-05-08-agent-flow-debug-stream-runtime-events-spec.md`

Implementation must preserve these decisions:

- No durable stream / outbox in core.
- Runtime cache loss is acceptable.
- No compatibility read path that merges `flow_run_events` and `runtime_events`.
- New debug stream history reads only `runtime_events`.

## File Structure

Frontend files:

- Modify `web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx`
  - Owns send/stop composer button rendering and key handling.
- Modify `web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx`
  - Maps debug session status into composer disabled/submitting/stopping state.
- Modify `web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx`
  - Passes stop action through the debug console shell.
- Modify `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
  - Binds debug console stop action to `debugSession.stopRun()`.
- Modify `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
  - Adds client-side stopping guard and exposes `stopping`.
- Modify `web/app/src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx`
  - Covers send/stop composer behavior.
- Modify `web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx`
  - Covers stop guard and cancel behavior.

Backend files:

- Rename `api/crates/control-plane/src/orchestration_runtime/debug_event_persister.rs`
  - New file name: `api/crates/control-plane/src/orchestration_runtime/runtime_event_persister.rs`
  - Persists debug stream envelopes into `runtime_events`.
- Modify `api/crates/control-plane/src/orchestration_runtime.rs`
  - Update module name and public helper to use `runtime_event_persister`.
- Modify `api/apps/api-server/src/routes/applications/application_runtime.rs`
  - Existing stream persister task continues to subscribe to `RuntimeEventStream`, but now writes `runtime_events`.
- Modify `api/crates/control-plane/src/runtime_observability/debug_read_model.rs`
  - Filters and maps `runtime_events` into debug stream parts.
- Modify `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`
  - Replace flow-run-event persistence assertions with runtime-event assertions.
- Modify `api/crates/control-plane/src/_tests/orchestration_runtime/runtime_observability.rs`
  - Add read-model coverage if the existing file already owns runtime event folding tests.

Verification files:

- Do not place warning or coverage outputs outside `tmp/test-governance/`.
- Use repository standard frontend test entry points, not bare `pnpm exec vitest`.

## Task 1: Frontend Composer Stop Button

**Files:**

- Modify: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx`
- Test: `web/app/src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx`

- [x] **Step 1: Write failing stop-button tests**

Replace `web/app/src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx` with tests that cover send and stop modes:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { DebugComposer } from '../../components/debug-console/conversation/DebugComposer';

describe('DebugComposer', () => {
  test('submits by button click and Enter key when not running', () => {
    const handleSubmit = vi.fn();

    render(
      <DebugComposer
        disabled={false}
        submitting={false}
        stopping={false}
        value="你好？"
        onChange={vi.fn()}
        onStop={vi.fn()}
        onSubmit={handleSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '发送调试消息' }));
    expect(screen.getByText('功能已开启')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText('和 Bot 聊天'), {
      key: 'Enter',
      code: 'Enter'
    });

    expect(handleSubmit).toHaveBeenCalledTimes(2);
  });

  test('shows stop action while submitting and does not submit on Enter', () => {
    const handleSubmit = vi.fn();
    const handleStop = vi.fn();

    render(
      <DebugComposer
        disabled={true}
        submitting={true}
        stopping={false}
        value=""
        onChange={vi.fn()}
        onStop={handleStop}
        onSubmit={handleSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '终止调试运行' }));
    fireEvent.keyDown(screen.getByPlaceholderText('和 Bot 聊天'), {
      key: 'Enter',
      code: 'Enter'
    });

    expect(handleStop).toHaveBeenCalledTimes(1);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  test('disables stop action while stopping', () => {
    const handleStop = vi.fn();

    render(
      <DebugComposer
        disabled={true}
        submitting={true}
        stopping={true}
        value=""
        onChange={vi.fn()}
        onStop={handleStop}
        onSubmit={vi.fn()}
      />
    );

    const stopButton = screen.getByRole('button', { name: '正在终止调试运行' });
    expect(stopButton).toBeDisabled();
    fireEvent.click(stopButton);
    expect(handleStop).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the focused composer test and verify it fails**

Run:

```bash
pnpm --dir web/app test -- debug-composer.test.tsx
```

Expected: FAIL because `DebugComposer` does not accept `stopping` / `onStop` and has no stop button.

- [x] **Step 3: Implement the composer button mode**

Update `DebugComposer.tsx`:

```tsx
import { ArrowRightOutlined, ArrowUpOutlined, MessageOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Input, Typography } from 'antd';
import { useState } from 'react';

export function DebugComposer({
  value,
  disabled,
  submitting,
  stopping,
  onChange,
  onStop,
  onSubmit
}: {
  value: string;
  disabled: boolean;
  submitting: boolean;
  stopping: boolean;
  onChange: (value: string) => void;
  onStop: () => void;
  onSubmit: () => void;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const showStop = submitting || stopping;

  return (
    <div className="agent-flow-editor__debug-composer">
      <div className="agent-flow-editor__debug-composer-box">
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          variant="borderless"
          placeholder="和 Bot 聊天"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={(event) => {
            if (
              event.key !== 'Enter' ||
              event.shiftKey ||
              isComposing ||
              event.nativeEvent.isComposing
            ) {
              return;
            }

            event.preventDefault();

            if (disabled || submitting || stopping) {
              return;
            }

            onSubmit();
          }}
        />
        <div className="agent-flow-editor__debug-composer-actions">
          {showStop ? (
            <Button
              aria-label={stopping ? '正在终止调试运行' : '终止调试运行'}
              className="agent-flow-editor__debug-composer-submit"
              disabled={stopping}
              icon={<StopOutlined />}
              loading={stopping}
              shape="circle"
              type="primary"
              danger
              onClick={onStop}
            />
          ) : (
            <Button
              aria-label="发送调试消息"
              className="agent-flow-editor__debug-composer-submit"
              disabled={disabled}
              icon={<ArrowUpOutlined />}
              shape="circle"
              type="primary"
              onClick={onSubmit}
            />
          )}
        </div>
      </div>
      <div className="agent-flow-editor__debug-feature-bar">
        <span className="agent-flow-editor__debug-feature-icon">
          <MessageOutlined />
        </span>
        <Typography.Text>功能已开启</Typography.Text>
        <Button
          aria-label="管理功能"
          className="agent-flow-editor__debug-feature-manage"
          icon={<ArrowRightOutlined />}
          iconPosition="end"
          size="small"
          type="link"
        >
          管理
        </Button>
      </div>
    </div>
  );
}
```

Keep the existing Chinese input-method guard.

- [x] **Step 4: Run the focused composer test and verify it passes**

Run:

```bash
pnpm --dir web/app test -- debug-composer.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add web/app/src/features/agent-flow/components/debug-console/conversation/DebugComposer.tsx web/app/src/features/agent-flow/_tests/debug-console/debug-composer.test.tsx
git commit -m "feat: show stop action in debug composer"
```

## Task 2: Frontend Debug Session Stop Guard

**Files:**

- Modify: `web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts`
- Modify: `web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx`
- Modify: `web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx`
- Modify: `web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx`
- Test: `web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx`

- [x] **Step 1: Write failing stop-guard test**

Add this test next to the existing cancel test in `debug-console-live-runtime.test.tsx`:

```tsx
  test('guards duplicate stop requests while cancellation is in flight', async () => {
    const queryClient = createQueryClient();
    vi.spyOn(runtimeApi, 'startFlowDebugRun').mockResolvedValue(createRunningRunDetail());
    const cancelFlowDebugRunSpy = vi
      .spyOn(runtimeApi, 'cancelFlowDebugRun')
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(createCancelledRunDetail()), 50);
          })
      );
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    const { result } = renderHook(
      () =>
        useAgentFlowDebugSession({
          applicationId: 'app-1',
          draftId: 'draft-1',
          document
        }),
      { wrapper: createWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.submitPrompt('请总结退款政策');
    });

    expect(result.current.status).toBe('running');

    act(() => {
      void result.current.stopRun();
      void result.current.stopRun();
    });

    expect(result.current.stopping).toBe(true);
    expect(cancelFlowDebugRunSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result.current.stopping).toBe(false);
    expect(result.current.status).toBe('cancelled');
  });
```

- [x] **Step 2: Run focused hook test and verify it fails**

Run:

```bash
pnpm --dir web/app test -- debug-console-live-runtime.test.tsx
```

Expected: FAIL because `stopping` is not returned and duplicate `stopRun()` calls are not guarded.

- [x] **Step 3: Implement `stopping` in `useAgentFlowDebugSession`**

In `useAgentFlowDebugSession.ts`:

```tsx
const [stopping, setStopping] = useState(false);
```

Update `stopRun()`:

```tsx
  async function stopRun() {
    const runId = lastDetail?.flow_run.id ?? activeRunIdRef.current;

    if (
      stopping ||
      !csrfToken ||
      !runId ||
      !['running', 'waiting_human', 'waiting_callback'].includes(status)
    ) {
      return null;
    }

    setStopping(true);
    try {
      const detail = await cancelFlowDebugRun(applicationId, runId, csrfToken);
      cancelActiveDebugStream();
      stopPolling();
      clearScheduledAssistantMessageFlush();
      await applyRunDetail(detail, { invalidateRuntime: true });
      return detail;
    } catch {
      return null;
    } finally {
      setStopping(false);
    }
  }
```

Return `stopping` from the hook:

```tsx
  return {
    status,
    stopping,
    debugSessionId: debugSessionState.id,
    runContext,
    messages,
    traceItems,
    variableGroups,
    submitPrompt,
    rerunLast,
    stopRun,
    clearSession,
    setRunContextValue,
    getNodePreviewVariableCache,
    rememberNodePreviewVariables,
    resetVariableCache
  };
```

- [x] **Step 4: Wire stop through debug console components**

Update `AgentFlowDebugConsole.tsx` props:

```tsx
export function AgentFlowDebugConsole({
  messages,
  runContext,
  status,
  stopping,
  onChangeRunContextValue,
  onClearSession,
  onClose,
  onLoadArtifact,
  onStopRun,
  onSubmitPrompt
}: {
  messages: AgentFlowDebugMessage[];
  runContext: AgentFlowRunContext;
  status: AgentFlowDebugSessionStatus;
  stopping: boolean;
  onChangeRunContextValue: (nodeId: string, key: string, value: unknown) => void;
  onClearSession: () => void;
  onClose: () => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
  onStopRun: () => void;
  onSubmitPrompt: () => void;
}) {
```

Pass into `DebugConversationPane`:

```tsx
        stopping={stopping}
        onStopRun={onStopRun}
```

Update `DebugConversationPane.tsx` props:

```tsx
  stopping,
  onStopRun,
```

and prop types:

```tsx
  stopping: boolean;
  onStopRun: () => void;
```

Pass into `DebugComposer`:

```tsx
        stopping={stopping}
        onStop={onStopRun}
```

Update `AgentFlowCanvasFrame.tsx`:

```tsx
              stopping={debugSession.stopping}
              onStopRun={() => {
                void debugSession.stopRun();
              }}
```

- [x] **Step 5: Run focused frontend tests**

Run:

```bash
pnpm --dir web/app test -- debug-composer.test.tsx debug-console-live-runtime.test.tsx
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add web/app/src/features/agent-flow/hooks/runtime/useAgentFlowDebugSession.ts web/app/src/features/agent-flow/components/debug-console/conversation/DebugConversationPane.tsx web/app/src/features/agent-flow/components/debug-console/AgentFlowDebugConsole.tsx web/app/src/features/agent-flow/components/editor/AgentFlowCanvasFrame.tsx web/app/src/features/agent-flow/_tests/debug-console/debug-console-live-runtime.test.tsx
git commit -m "feat: wire debug preview stop action"
```

## Task 3: Runtime Events Persister

**Files:**

- Rename: `api/crates/control-plane/src/orchestration_runtime/debug_event_persister.rs` -> `api/crates/control-plane/src/orchestration_runtime/runtime_event_persister.rs`
- Modify: `api/crates/control-plane/src/orchestration_runtime.rs`
- Test: `api/crates/control-plane/src/_tests/orchestration_runtime/service.rs`

- [x] **Step 1: Update tests to assert `runtime_events` writes**

In `service.rs`, replace the three existing `debug_event_persister_*` tests with runtime-event assertions.

Use this first replacement test:

```rust
#[tokio::test]
async fn runtime_event_persister_coalesces_text_delta_runtime_events() {
    let repository =
        crate::orchestration_runtime::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
    let run_id = Uuid::now_v7();
    let node_run_id = Uuid::now_v7();
    let events = vec![
        runtime_text_delta(run_id, node_run_id, "退"),
        runtime_text_delta(run_id, node_run_id, "款"),
        runtime_text_delta(run_id, node_run_id, "摘要"),
    ];

    control_plane::orchestration_runtime::persist_runtime_debug_stream_events(&repository, events)
        .await
        .unwrap();

    let runtime_events = repository.list_runtime_events(run_id, 0).await.unwrap();
    assert_eq!(runtime_events.len(), 1);
    assert_eq!(runtime_events[0].event_type, "text_delta");
    assert_eq!(runtime_events[0].node_run_id, Some(node_run_id));
    assert_eq!(runtime_events[0].layer, domain::RuntimeEventLayer::RuntimeItem);
    assert_eq!(runtime_events[0].source, domain::RuntimeEventSource::Host);
    assert_eq!(runtime_events[0].visibility, domain::RuntimeEventVisibility::Workspace);
    assert_eq!(runtime_events[0].durability, domain::RuntimeEventDurability::Durable);
    assert_eq!(runtime_events[0].payload["text"], "退款摘要");

    let run_events = repository.events_for_flow_run(run_id);
    assert!(run_events.is_empty());
}
```

Use this second replacement test:

```rust
#[tokio::test]
async fn runtime_event_persister_persists_delta_cursor_and_artifact_metadata() {
    let repository =
        crate::orchestration_runtime::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
    let run_id = Uuid::now_v7();
    let node_run_id = Uuid::now_v7();
    let events = vec![
        runtime_text_delta_with_payload(
            run_id,
            7,
            json!({
                "type": "text_delta",
                "node_run_id": node_run_id,
                "node_id": "node-llm",
                "text": "退",
                "text_ref": "runtime_artifact:inline:chunk-1",
                "truncation": {
                    "truncated": true,
                    "reason": "max_bytes",
                    "original_bytes": 200
                }
            }),
        ),
        runtime_text_delta_with_payload(
            run_id,
            8,
            json!({
                "type": "text_delta",
                "node_run_id": node_run_id,
                "node_id": "node-llm",
                "text": "款",
                "artifact_refs": ["runtime_artifact:object:chunk-2"]
            }),
        ),
    ];

    control_plane::orchestration_runtime::persist_runtime_debug_stream_events(&repository, events)
        .await
        .unwrap();

    let runtime_events = repository.list_runtime_events(run_id, 0).await.unwrap();
    assert_eq!(runtime_events.len(), 1);
    let event = &runtime_events[0];
    assert_eq!(event.node_run_id, Some(node_run_id));
    assert_eq!(event.event_type, "text_delta");
    assert_eq!(event.payload["event_type"], "text_delta");
    assert_eq!(event.payload["node_run_id"], node_run_id.to_string());
    assert_eq!(event.payload["content_type"], "text");
    assert_eq!(event.payload["sequence_start"], 7);
    assert_eq!(event.payload["sequence_end"], 8);
    assert_eq!(
        event.payload["event_ids"],
        json!([format!("{run_id}:7"), format!("{run_id}:8")])
    );
    assert_eq!(event.payload["truncated"], true);
    assert_eq!(event.payload["truncation"]["reason"], "max_bytes");
    assert_eq!(event.payload["truncation"]["original_bytes"], 200);
    assert_eq!(
        event.payload["content_refs"],
        json!(["runtime_artifact:inline:chunk-1"])
    );
    assert_eq!(
        event.payload["artifact_refs"],
        json!([
            "runtime_artifact:inline:chunk-1",
            "runtime_artifact:object:chunk-2"
        ])
    );
}
```

Use this third replacement test:

```rust
#[tokio::test]
async fn runtime_event_persister_coalesces_reasoning_delta_separately_from_text() {
    let repository =
        crate::orchestration_runtime::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
    let run_id = Uuid::now_v7();
    let node_run_id = Uuid::now_v7();
    let events = vec![
        runtime_reasoning_delta(run_id, node_run_id, "先"),
        runtime_reasoning_delta(run_id, node_run_id, "分析"),
        runtime_text_delta(run_id, node_run_id, "结"),
        runtime_text_delta(run_id, node_run_id, "果"),
    ];

    control_plane::orchestration_runtime::persist_runtime_debug_stream_events(&repository, events)
        .await
        .unwrap();

    let runtime_events = repository.list_runtime_events(run_id, 0).await.unwrap();
    assert_eq!(runtime_events.len(), 2);
    assert_eq!(runtime_events[0].event_type, "reasoning_delta");
    assert_eq!(runtime_events[0].payload["text"], "先分析");
    assert_eq!(runtime_events[1].event_type, "text_delta");
    assert_eq!(runtime_events[1].payload["text"], "结果");
}
```

- [x] **Step 2: Add terminal flush test**

Add this test in the same file:

```rust
#[tokio::test]
async fn runtime_event_persister_flushes_pending_delta_before_cancelled_terminal_event() {
    let repository =
        crate::orchestration_runtime::test_support::InMemoryOrchestrationRuntimeRepository::with_permissions(vec![]);
    let run_id = Uuid::now_v7();
    let node_run_id = Uuid::now_v7();
    let terminal = RuntimeEventEnvelope::new(
        run_id,
        9,
        RuntimeEventPayload {
            event_type: "flow_cancelled".to_string(),
            source: RuntimeEventSource::Runtime,
            durability: RuntimeEventDurability::DurableRequired,
            persist_required: true,
            trace_visible: true,
            payload: json!({
                "type": "flow_cancelled",
                "run_id": run_id,
                "status": "cancelled",
                "reason": "manual_stop"
            }),
        },
    );

    control_plane::orchestration_runtime::persist_runtime_debug_stream_events(
        &repository,
        vec![
            runtime_text_delta_with_payload(
                run_id,
                7,
                json!({
                    "type": "text_delta",
                    "node_run_id": node_run_id,
                    "node_id": "node-llm",
                    "text": "正在"
                }),
            ),
            runtime_text_delta_with_payload(
                run_id,
                8,
                json!({
                    "type": "text_delta",
                    "node_run_id": node_run_id,
                    "node_id": "node-llm",
                    "text": "回答"
                }),
            ),
            terminal,
        ],
    )
    .await
    .unwrap();

    let runtime_events = repository.list_runtime_events(run_id, 0).await.unwrap();
    assert_eq!(runtime_events.len(), 2);
    assert_eq!(runtime_events[0].event_type, "text_delta");
    assert_eq!(runtime_events[0].payload["text"], "正在回答");
    assert_eq!(runtime_events[1].event_type, "flow_cancelled");
    assert_eq!(runtime_events[1].layer, domain::RuntimeEventLayer::AgentTransition);
}
```

- [x] **Step 3: Run backend focused test and verify failures**

Run:

```bash
cargo test -p control-plane runtime_event_persister --lib
```

Expected: FAIL because `persist_runtime_debug_stream_events` does not exist and current persister writes `flow_run_events`.

- [x] **Step 4: Rename module and public function**

In `api/crates/control-plane/src/orchestration_runtime.rs`, change:

```rust
mod debug_event_persister;
```

to:

```rust
mod runtime_event_persister;
```

Replace the public helper with:

```rust
pub async fn persist_runtime_debug_stream_events<R>(
    repository: &R,
    events: Vec<RuntimeEventEnvelope>,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    runtime_event_persister::persist_runtime_debug_stream_events(repository, events).await
}
```

Rename the file:

```bash
git mv api/crates/control-plane/src/orchestration_runtime/debug_event_persister.rs api/crates/control-plane/src/orchestration_runtime/runtime_event_persister.rs
```

- [x] **Step 5: Implement runtime-event writes**

In `runtime_event_persister.rs`, replace `AppendRunEventInput` with `AppendRuntimeEventInput` and build runtime event inputs:

```rust
use crate::ports::{
    AppendRuntimeEventInput, OrchestrationRuntimeRepository, RuntimeEventEnvelope,
};
```

Use this classifier:

```rust
fn classify_event(
    event_type: &str,
    source: crate::ports::RuntimeEventSource,
) -> (
    domain::RuntimeEventLayer,
    domain::RuntimeEventSource,
    domain::RuntimeTrustLevel,
    domain::RuntimeEventVisibility,
    domain::RuntimeEventDurability,
) {
    let layer = match event_type {
        "flow_started" | "flow_finished" | "flow_failed" | "flow_cancelled"
        | "waiting_human" | "waiting_callback" => domain::RuntimeEventLayer::AgentTransition,
        "tool_call_commit" | "tool_result_appended" | "capability_call_requested"
        | "capability_call_finished" => domain::RuntimeEventLayer::Capability,
        "usage_snapshot" | "usage_recorded" | "cost_recorded" => {
            domain::RuntimeEventLayer::Ledger
        }
        "error" | "run_failed" | "llm_turn_failed" => domain::RuntimeEventLayer::Diagnostic,
        _ => domain::RuntimeEventLayer::RuntimeItem,
    };
    let source = match source {
        crate::ports::RuntimeEventSource::Provider => domain::RuntimeEventSource::Host,
        crate::ports::RuntimeEventSource::Runtime => domain::RuntimeEventSource::Host,
        crate::ports::RuntimeEventSource::Persister => domain::RuntimeEventSource::Host,
        crate::ports::RuntimeEventSource::System => domain::RuntimeEventSource::Host,
    };

    (
        layer,
        source,
        domain::RuntimeTrustLevel::HostFact,
        domain::RuntimeEventVisibility::Workspace,
        domain::RuntimeEventDurability::Durable,
    )
}
```

Update flush code so it pushes `AppendRuntimeEventInput` and calls:

```rust
repository.append_runtime_events(&runtime_events).await?;
```

Do not call `append_run_events` from this persister.

- [x] **Step 6: Update API route persister call**

In `application_runtime.rs`, replace:

```rust
control_plane::orchestration_runtime::persist_debug_stream_events(repository, events).await
```

with:

```rust
control_plane::orchestration_runtime::persist_runtime_debug_stream_events(repository, events).await
```

- [x] **Step 7: Run backend focused tests**

Run:

```bash
cargo test -p control-plane runtime_event_persister --lib
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add api/crates/control-plane/src/orchestration_runtime.rs api/crates/control-plane/src/orchestration_runtime/runtime_event_persister.rs api/apps/api-server/src/routes/applications/application_runtime.rs api/crates/control-plane/src/_tests/orchestration_runtime/service.rs
git add -u api/crates/control-plane/src/orchestration_runtime/debug_event_persister.rs
git commit -m "feat: persist debug stream history to runtime events"
```

## Task 4: Historical Debug Stream Read Model

**Files:**

- Modify: `api/crates/control-plane/src/runtime_observability/debug_read_model.rs`
- Test: `api/crates/control-plane/src/_tests/orchestration_runtime/runtime_observability.rs`

- [x] **Step 1: Write read-model tests**

Add tests to `runtime_observability.rs`:

```rust
#[test]
fn debug_read_model_maps_cancelled_terminal_event_to_status_part() {
    let run_id = uuid::Uuid::now_v7();
    let event = domain::RuntimeEventRecord {
        id: uuid::Uuid::now_v7(),
        flow_run_id: run_id,
        node_run_id: None,
        span_id: None,
        parent_span_id: None,
        sequence: 1,
        event_type: "flow_cancelled".to_string(),
        layer: domain::RuntimeEventLayer::AgentTransition,
        source: domain::RuntimeEventSource::Host,
        trust_level: domain::RuntimeTrustLevel::HostFact,
        item_id: None,
        ledger_ref: None,
        payload: serde_json::json!({ "status": "cancelled", "reason": "manual_stop" }),
        visibility: domain::RuntimeEventVisibility::Workspace,
        durability: domain::RuntimeEventDurability::Durable,
        created_at: time::OffsetDateTime::now_utc(),
    };

    let part = control_plane::runtime_observability::debug_read_model::fold_event_to_debug_part(
        run_id,
        &event,
    )
    .expect("flow_cancelled should fold to a debug part");

    assert_eq!(part.part_type, "status");
    assert_eq!(part.payload["event_type"], "flow_cancelled");
}

#[test]
fn debug_read_model_excludes_provider_raw_by_default() {
    let run_id = uuid::Uuid::now_v7();
    let event = domain::RuntimeEventRecord {
        id: uuid::Uuid::now_v7(),
        flow_run_id: run_id,
        node_run_id: None,
        span_id: None,
        parent_span_id: None,
        sequence: 1,
        event_type: "text_delta".to_string(),
        layer: domain::RuntimeEventLayer::ProviderRaw,
        source: domain::RuntimeEventSource::Host,
        trust_level: domain::RuntimeTrustLevel::HostFact,
        item_id: None,
        ledger_ref: None,
        payload: serde_json::json!({ "delta": "raw" }),
        visibility: domain::RuntimeEventVisibility::Workspace,
        durability: domain::RuntimeEventDurability::Durable,
        created_at: time::OffsetDateTime::now_utc(),
    };

    let part = control_plane::runtime_observability::debug_read_model::fold_event_to_debug_part(
        run_id,
        &event,
    );

    assert!(part.is_none());
}
```

- [x] **Step 2: Run read-model tests and verify failure**

Run:

```bash
cargo test -p control-plane debug_read_model --lib
```

Expected: FAIL because provider raw is not filtered and `flow_cancelled` maps to `data`.

- [x] **Step 3: Implement read-model filter and mappings**

Update `fold_event_to_debug_part`:

```rust
pub fn fold_event_to_debug_part(
    flow_run_id: uuid::Uuid,
    event: &domain::RuntimeEventRecord,
) -> Option<DebugStreamPart> {
    if event.layer == domain::RuntimeEventLayer::ProviderRaw {
        return None;
    }

    let part_type = match event.event_type.as_str() {
        "text_delta" => "text",
        "reasoning_delta" => "reasoning",
        "node_started" | "node_finished" => "trace",
        "flow_started" | "flow_finished" | "flow_cancelled" | "waiting_human"
        | "waiting_callback" => "status",
        "tool_call_commit" | "capability_call_requested" => "tool_input",
        "tool_result_appended" | "capability_call_finished" => "tool_output",
        "approval_requested" | "approval_resolved" => "approval",
        "handoff" => "handoff",
        "usage_snapshot" | "usage_recorded" => "usage_snapshot",
        "cost_recorded" | "credit_debited" | "credit_refunded" => "ledger_ref",
        "error" | "run_failed" | "llm_turn_failed" | "flow_failed" => "error",
        _ => "data",
    };
```

Keep the existing `DebugStreamPart` payload shape.

- [x] **Step 4: Run read-model tests**

Run:

```bash
cargo test -p control-plane debug_read_model --lib
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add api/crates/control-plane/src/runtime_observability/debug_read_model.rs api/crates/control-plane/src/_tests/orchestration_runtime/runtime_observability.rs
git commit -m "feat: fold runtime events into debug stream parts"
```

## Task 5: Backend Route And Repository Regression

**Files:**

- Modify if needed: `api/apps/api-server/src/routes/applications/application_runtime.rs`
- Modify if needed: `api/crates/storage-durable/postgres/src/orchestration_runtime_repository/event_methods.rs`
- Test: existing backend integration and repository tests

- [x] **Step 1: Verify route uses runtime events only for historical stream**

Confirm `get_runtime_debug_stream` still reads:

```rust
<MainDurableStore as OrchestrationRuntimeRepository>::list_runtime_events(
    &state.store,
    run_id,
    0,
)
```

and does not read `flow_run_events`.

- [x] **Step 2: Verify repository batch append is reused**

Confirm `append_runtime_events` in `event_methods.rs` writes to:

```sql
insert into runtime_events (
  id,
  flow_run_id,
  node_run_id,
  span_id,
  parent_span_id,
  sequence,
  event_type,
  layer,
  source,
  trust_level,
  item_id,
  ledger_ref,
  payload,
  visibility,
  durability
)
```

No storage schema migration is needed if this table already exists.

- [x] **Step 3: Run repository and route-focused backend tests**

Run:

```bash
cargo test -p storage-postgres orchestration_runtime_repository_batch_appends_run_and_runtime_events
cargo test -p api-server application_runtime_routes_cancel_waiting_flow_run
```

Expected: PASS.

- [x] **Step 4: Run control-plane runtime test subset**

Run:

```bash
cargo test -p control-plane orchestration_runtime --lib
```

Expected: PASS.

- [x] **Step 5: Commit any route/repository fixes**

If no files changed in this task, skip the commit. If route or repository files changed:

```bash
git add api/apps/api-server/src/routes/applications/application_runtime.rs api/crates/storage-durable/postgres/src/orchestration_runtime_repository/event_methods.rs
git commit -m "test: verify runtime event debug stream persistence"
```

## Task 6: Final Verification

**Files:**

- Read: `docs/specs/2026-05-08-agent-flow-debug-stream-runtime-events-spec.md`
- Read: this plan
- No production file edits expected

- [x] **Step 1: Run frontend focused tests**

Run:

```bash
pnpm --dir web/app test -- debug-composer.test.tsx debug-console-live-runtime.test.tsx
```

Expected: PASS.

- [x] **Step 2: Run backend focused tests**

Run:

```bash
cargo test -p control-plane runtime_event_persister --lib
cargo test -p control-plane debug_read_model --lib
```

Expected: PASS.

- [x] **Step 3: Run route/repository checks**

Run:

```bash
cargo test -p storage-postgres orchestration_runtime_repository_batch_appends_run_and_runtime_events
cargo test -p api-server application_runtime_routes_cancel_waiting_flow_run
```

Expected: PASS.

- [x] **Step 4: Inspect for forbidden compatibility path**

Run:

```bash
rg -n "flow_run_events|append_run_events|persist_debug_stream_events|ProviderRaw" \
  api/crates/control-plane/src/orchestration_runtime.rs \
  api/crates/control-plane/src/orchestration_runtime \
  api/apps/api-server/src/routes/applications/application_runtime.rs \
  api/crates/control-plane/src/runtime_observability/debug_read_model.rs
```

Expected:

- No call to `persist_debug_stream_events`.
- No debug stream persister call to `append_run_events`.
- `ProviderRaw` appears only in read-model filtering or provider raw observability paths.
- `flow_run_events` does not appear in the new runtime debug stream persister path.

- [x] **Step 5: Commit verification-only documentation if changed**

If implementation notes were added to the spec or plan:

```bash
git add docs/specs/2026-05-08-agent-flow-debug-stream-runtime-events-spec.md docs/plans/2026-05-08-agent-flow-debug-stream-runtime-events-plan.md
git commit -m "docs: document debug stream runtime events implementation"
```

## Self-Review Checklist

- Spec coverage:
  - Preview stop is covered by Tasks 1 and 2.
  - Runtime events as historical truth is covered by Tasks 3 and 4.
  - No compatibility merge path is covered by Task 6.
  - Best-effort runtime cache stance is preserved; no durable stream/outbox task is introduced.
- Type consistency:
  - `stopping` is added to `useAgentFlowDebugSession` and passed through all debug console layers.
  - `persist_runtime_debug_stream_events` is the new public backend helper.
  - `runtime_event_persister` writes `AppendRuntimeEventInput`.
- Verification:
  - Frontend tests use `pnpm --dir web/app test`.
  - Backend tests are cargo-focused and serializable.
  - No warning or coverage outputs are required by this plan.
