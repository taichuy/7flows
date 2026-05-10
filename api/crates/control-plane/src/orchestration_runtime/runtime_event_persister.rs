use anyhow::Result;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::ports::{AppendRuntimeEventInput, OrchestrationRuntimeRepository, RuntimeEventEnvelope};

pub async fn persist_runtime_debug_stream_events<R>(
    repository: &R,
    events: Vec<RuntimeEventEnvelope>,
) -> Result<()>
where
    R: OrchestrationRuntimeRepository,
{
    let mut runtime_events = Vec::new();
    let mut pending_delta: Option<PendingStreamDelta> = None;

    for event in events {
        if !event.persist_required {
            continue;
        }

        if is_stream_delta_event(&event.event_type) {
            let node_run_id = event.node_run_id;
            let text = event
                .text
                .as_deref()
                .or_else(|| event.payload.get("text").and_then(Value::as_str))
                .or_else(|| event.payload.get("delta").and_then(Value::as_str))
                .unwrap_or_default();

            match &mut pending_delta {
                Some(pending)
                    if pending.run_id == event.run_id
                        && pending.node_run_id == node_run_id
                        && pending.event_type == event.event_type =>
                {
                    pending.text.push_str(text);
                    pending.sequence_end = event.sequence;
                    pending.merge_metadata(&event);
                    pending.event_ids.push(event.event_id);
                }
                _ => {
                    flush_pending_delta(&mut runtime_events, pending_delta.take());
                    let mut next_pending = PendingStreamDelta {
                        run_id: event.run_id,
                        node_run_id,
                        sequence_start: event.sequence,
                        sequence_end: event.sequence,
                        event_ids: vec![event.event_id.clone()],
                        event_type: event.event_type.clone(),
                        content_type: event.content_type.clone(),
                        source: event.source,
                        text: text.to_string(),
                        content_refs: Vec::new(),
                        artifact_refs: Vec::new(),
                        truncated: false,
                        truncation_reason: None,
                        original_bytes: None,
                    };
                    next_pending.merge_metadata(&event);
                    pending_delta = Some(next_pending);
                }
            }
            continue;
        }

        flush_pending_delta(&mut runtime_events, pending_delta.take());
        runtime_events.push(build_runtime_event_input(
            event.run_id,
            event.node_run_id,
            event.event_type,
            event.source,
            event.payload,
        ));
    }

    flush_pending_delta(&mut runtime_events, pending_delta.take());
    if !runtime_events.is_empty() {
        repository.append_runtime_events(&runtime_events).await?;
    }

    Ok(())
}

fn is_stream_delta_event(event_type: &str) -> bool {
    event_type == "text_delta" || event_type == "reasoning_delta"
}

struct PendingStreamDelta {
    run_id: Uuid,
    node_run_id: Option<Uuid>,
    sequence_start: i64,
    sequence_end: i64,
    event_ids: Vec<String>,
    event_type: String,
    content_type: Option<String>,
    source: crate::ports::RuntimeEventSource,
    text: String,
    content_refs: Vec<String>,
    artifact_refs: Vec<String>,
    truncated: bool,
    truncation_reason: Option<String>,
    original_bytes: Option<i64>,
}

impl PendingStreamDelta {
    fn merge_metadata(&mut self, event: &RuntimeEventEnvelope) {
        collect_string_field(&event.payload, "text_ref", &mut self.content_refs);
        collect_string_field(&event.payload, "content_ref", &mut self.content_refs);
        collect_string_field(&event.payload, "payload_ref", &mut self.content_refs);
        collect_string_array_field(&event.payload, "content_refs", &mut self.content_refs);
        collect_string_array_field(&event.payload, "payload_refs", &mut self.content_refs);
        collect_string_field(&event.payload, "artifact_ref", &mut self.artifact_refs);
        collect_string_array_field(&event.payload, "artifact_refs", &mut self.artifact_refs);
        for content_ref in self.content_refs.clone() {
            if content_ref.starts_with("runtime_artifact:") {
                push_unique(&mut self.artifact_refs, content_ref);
            }
        }

        let truncation = event.payload.get("truncation").and_then(Value::as_object);
        let event_truncated = event
            .payload
            .get("truncated")
            .or_else(|| event.payload.get("is_truncated"))
            .and_then(Value::as_bool)
            .unwrap_or(false)
            || truncation
                .and_then(|value| value.get("truncated"))
                .and_then(Value::as_bool)
                .unwrap_or(false);
        self.truncated = self.truncated || event_truncated;

        if self.truncation_reason.is_none() {
            self.truncation_reason = event
                .payload
                .get("truncation_reason")
                .and_then(Value::as_str)
                .or_else(|| {
                    truncation
                        .and_then(|value| value.get("reason"))
                        .and_then(Value::as_str)
                })
                .map(ToString::to_string);
        }

        let original_bytes = event
            .payload
            .get("original_bytes")
            .and_then(Value::as_i64)
            .or_else(|| {
                truncation
                    .and_then(|value| value.get("original_bytes"))
                    .and_then(Value::as_i64)
            });
        if let Some(original_bytes) = original_bytes {
            self.original_bytes = Some(self.original_bytes.unwrap_or(0).max(original_bytes));
        }
    }
}

fn flush_pending_delta(
    runtime_events: &mut Vec<AppendRuntimeEventInput>,
    pending_delta: Option<PendingStreamDelta>,
) {
    let Some(pending) = pending_delta else {
        return;
    };
    let event_type = pending.event_type;
    let node_run_id = pending.node_run_id.map(|value| value.to_string());
    let stored_bytes = pending.text.len() as i64;
    let original_bytes = pending.original_bytes.unwrap_or(stored_bytes);
    let content_refs = pending.content_refs;
    let artifact_refs = pending.artifact_refs;

    runtime_events.push(build_runtime_event_input(
        pending.run_id,
        pending.node_run_id,
        event_type.clone(),
        pending.source,
        json!({
            "type": event_type.clone(),
            "event_type": event_type,
            "node_run_id": node_run_id,
            "text": pending.text,
            "content_type": pending.content_type,
            "sequence_start": pending.sequence_start,
            "sequence_end": pending.sequence_end,
            "event_ids": pending.event_ids,
            "truncated": pending.truncated,
            "truncation": {
                "truncated": pending.truncated,
                "reason": pending.truncation_reason,
                "original_bytes": original_bytes,
                "stored_bytes": stored_bytes,
            },
            "content_refs": content_refs.clone(),
            "artifact_refs": artifact_refs.clone(),
            "refs": {
                "content": content_refs,
                "artifacts": artifact_refs,
            },
        }),
    ));
}

fn build_runtime_event_input(
    flow_run_id: Uuid,
    node_run_id: Option<Uuid>,
    event_type: String,
    source: crate::ports::RuntimeEventSource,
    payload: Value,
) -> AppendRuntimeEventInput {
    let (layer, source, trust_level, visibility, durability) = classify_event(&event_type, source);

    AppendRuntimeEventInput {
        flow_run_id,
        node_run_id,
        span_id: None,
        parent_span_id: None,
        event_type,
        layer,
        source,
        trust_level,
        item_id: None,
        ledger_ref: None,
        payload,
        visibility,
        durability,
    }
}

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
        "flow_started" | "flow_finished" | "flow_failed" | "flow_cancelled" | "waiting_human"
        | "waiting_callback" => domain::RuntimeEventLayer::AgentTransition,
        "tool_call_commit"
        | "tool_result_appended"
        | "capability_call_requested"
        | "capability_call_finished" => domain::RuntimeEventLayer::Capability,
        "usage_snapshot" | "usage_recorded" | "cost_recorded" => domain::RuntimeEventLayer::Ledger,
        "error" | "run_failed" | "llm_turn_failed" => domain::RuntimeEventLayer::Diagnostic,
        _ => domain::RuntimeEventLayer::RuntimeItem,
    };
    let source = match source {
        crate::ports::RuntimeEventSource::Runtime
        | crate::ports::RuntimeEventSource::Provider
        | crate::ports::RuntimeEventSource::Persister
        | crate::ports::RuntimeEventSource::System => domain::RuntimeEventSource::Host,
    };

    (
        layer,
        source,
        domain::RuntimeTrustLevel::HostFact,
        domain::RuntimeEventVisibility::Workspace,
        domain::RuntimeEventDurability::Durable,
    )
}

fn collect_string_field(payload: &Value, key: &str, output: &mut Vec<String>) {
    if let Some(value) = payload.get(key).and_then(Value::as_str) {
        push_unique(output, value.to_string());
    }
}

fn collect_string_array_field(payload: &Value, key: &str, output: &mut Vec<String>) {
    let Some(values) = payload.get(key).and_then(Value::as_array) else {
        return;
    };

    for value in values.iter().filter_map(Value::as_str) {
        push_unique(output, value.to_string());
    }
}

fn push_unique(output: &mut Vec<String>, value: String) {
    if !output.iter().any(|existing| existing == &value) {
        output.push(value);
    }
}
