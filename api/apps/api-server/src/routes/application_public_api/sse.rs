use std::{convert::Infallible, sync::Arc};

use axum::response::sse::Event;
use control_plane::{
    application_public_api::native::NativeRunResult,
    ports::{RuntimeEventEnvelope, RuntimeEventStream},
};
use serde::Serialize;
use serde_json::{json, Value};
use time::format_description::well_known::Rfc3339;
use tokio::sync::mpsc;
use uuid::Uuid;

pub type NativeRunSseStream = tokio_stream::wrappers::ReceiverStream<Result<Event, Infallible>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IncludeWorkflowEvents {
    None,
    Public,
}

#[derive(Debug, Serialize)]
struct NativeSsePayload {
    run_id: Uuid,
    status: &'static str,
    created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    delta: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    answer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    conversation: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attachments: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workflow: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    required_action: Option<Value>,
}

fn event_created_at(envelope: &RuntimeEventEnvelope) -> String {
    envelope
        .occurred_at
        .format(&Rfc3339)
        .unwrap_or_else(|_| envelope.occurred_at.to_string())
}

fn native_terminal_payload(
    initial_run: &NativeRunResult,
    envelope: &RuntimeEventEnvelope,
    status: &'static str,
) -> NativeSsePayload {
    let output = envelope
        .payload
        .get("output")
        .cloned()
        .unwrap_or(Value::Null);
    NativeSsePayload {
        run_id: initial_run.id,
        status,
        created_at: event_created_at(envelope),
        delta: None,
        answer: output
            .get("answer")
            .or_else(|| output.get("text"))
            .or_else(|| output.get("output"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        conversation: initial_run.metadata.get("request").and_then(|request| {
            request
                .get("conversation")
                .cloned()
                .filter(|value| !value.is_null())
        }),
        usage: output.get("usage").cloned(),
        attachments: output.get("attachments").cloned(),
        metadata: Some(initial_run.metadata.clone()),
        error: None,
        workflow: None,
        required_action: None,
    }
}

fn workflow_payload(envelope: &RuntimeEventEnvelope) -> Value {
    json!({
        "type": envelope.event_type,
        "run_id": envelope.run_id,
        "node": {
            "id": envelope.payload.get("node_id").cloned().unwrap_or(Value::Null),
            "type": envelope.payload.get("node_type").cloned().unwrap_or(Value::Null),
            "title": envelope.payload.get("title").cloned().unwrap_or(Value::Null),
        },
        "status": envelope.payload.get("status").cloned().unwrap_or(Value::Null),
    })
}

fn runtime_event_to_native_sse(
    initial_run: &NativeRunResult,
    include_workflow_events: IncludeWorkflowEvents,
    envelope: RuntimeEventEnvelope,
) -> Option<Result<Event, Infallible>> {
    let event_id = envelope.event_id.clone();
    let created_at = event_created_at(&envelope);
    let (event_name, payload) = match envelope.event_type.as_str() {
        "flow_started" => (
            "run.started",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "running",
                created_at,
                delta: None,
                answer: None,
                conversation: initial_run.metadata.get("request").and_then(|request| {
                    request
                        .get("conversation")
                        .cloned()
                        .filter(|value| !value.is_null())
                }),
                usage: None,
                attachments: None,
                metadata: Some(initial_run.metadata.clone()),
                error: None,
                workflow: None,
                required_action: None,
            },
        ),
        "text_delta" => (
            "message.delta",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "running",
                created_at,
                delta: envelope.text.clone(),
                answer: None,
                conversation: None,
                usage: None,
                attachments: None,
                metadata: None,
                error: None,
                workflow: None,
                required_action: None,
            },
        ),
        "node_started" | "node_finished"
            if include_workflow_events == IncludeWorkflowEvents::Public =>
        {
            (
                "workflow.event",
                NativeSsePayload {
                    run_id: initial_run.id,
                    status: "running",
                    created_at,
                    delta: None,
                    answer: None,
                    conversation: None,
                    usage: None,
                    attachments: None,
                    metadata: None,
                    error: None,
                    workflow: Some(workflow_payload(&envelope)),
                    required_action: None,
                },
            )
        }
        "waiting_human" | "waiting_callback" => (
            "required_action",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "waiting",
                created_at,
                delta: None,
                answer: None,
                conversation: initial_run.metadata.get("request").and_then(|request| {
                    request
                        .get("conversation")
                        .cloned()
                        .filter(|value| !value.is_null())
                }),
                usage: None,
                attachments: None,
                metadata: Some(initial_run.metadata.clone()),
                error: None,
                workflow: None,
                required_action: Some(json!({
                    "type": envelope.event_type,
                    "run_id": initial_run.id,
                })),
            },
        ),
        "flow_finished" => (
            "run.completed",
            native_terminal_payload(initial_run, &envelope, "succeeded"),
        ),
        "flow_failed" => (
            "run.failed",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "failed",
                created_at,
                delta: None,
                answer: None,
                conversation: initial_run.metadata.get("request").and_then(|request| {
                    request
                        .get("conversation")
                        .cloned()
                        .filter(|value| !value.is_null())
                }),
                usage: None,
                attachments: None,
                metadata: Some(initial_run.metadata.clone()),
                error: Some(json!({
                    "code": "runtime_error",
                    "message": envelope
                        .payload
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("published run failed"),
                })),
                workflow: None,
                required_action: None,
            },
        ),
        "flow_cancelled" => (
            "run.cancelled",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "cancelled",
                created_at,
                delta: None,
                answer: None,
                conversation: initial_run.metadata.get("request").and_then(|request| {
                    request
                        .get("conversation")
                        .cloned()
                        .filter(|value| !value.is_null())
                }),
                usage: None,
                attachments: None,
                metadata: Some(initial_run.metadata.clone()),
                error: None,
                workflow: None,
                required_action: None,
            },
        ),
        "usage_delta" => (
            "usage.delta",
            NativeSsePayload {
                run_id: initial_run.id,
                status: "running",
                created_at,
                delta: None,
                answer: None,
                conversation: None,
                usage: Some(envelope.payload.clone()),
                attachments: None,
                metadata: None,
                error: None,
                workflow: None,
                required_action: None,
            },
        ),
        _ => return None,
    };

    Some(Ok(Event::default()
        .id(event_id)
        .event(event_name)
        .json_data(payload)
        .expect("native SSE payload should serialize")))
}

fn is_public_terminal_runtime_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "flow_finished" | "flow_failed" | "flow_cancelled" | "waiting_human" | "waiting_callback"
    )
}

pub async fn send_native_runtime_event_stream(
    stream: Arc<dyn RuntimeEventStream>,
    initial_run: NativeRunResult,
    include_workflow_events: IncludeWorkflowEvents,
    sender: mpsc::Sender<Result<Event, Infallible>>,
) {
    let Ok(mut subscription) = stream.subscribe(initial_run.id, None).await else {
        return;
    };

    for event in subscription.replay {
        let is_terminal = is_public_terminal_runtime_event(&event.event_type);
        if let Some(sse) = runtime_event_to_native_sse(&initial_run, include_workflow_events, event)
        {
            if sender.send(sse).await.is_err() {
                return;
            }
        }
        if is_terminal {
            return;
        }
    }

    while let Some(event) = subscription.live_events.recv().await {
        let is_terminal = is_public_terminal_runtime_event(&event.event_type);
        if let Some(sse) = runtime_event_to_native_sse(&initial_run, include_workflow_events, event)
        {
            if sender.send(sse).await.is_err() {
                return;
            }
        }
        if is_terminal {
            return;
        }
    }
}
