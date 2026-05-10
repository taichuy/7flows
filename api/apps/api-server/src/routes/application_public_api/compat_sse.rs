use std::{convert::Infallible, sync::Arc};

use axum::response::{
    sse::{Event, KeepAlive, Sse},
    IntoResponse, Response,
};
use control_plane::{
    application_public_api::native::NativeRunResult,
    orchestration_runtime::{
        debug_stream_events, OrchestrationRuntimeService, StartPublishedFlowRunCommand,
    },
    ports::{RuntimeEventEnvelope, RuntimeEventStream},
};
use serde_json::{json, Value};
use tokio::sync::mpsc;

use crate::{
    app_state::ApiState,
    provider_runtime::ApiProviderRuntime,
    routes::application_public_api::native::{service_error, NativeApiError},
};

type CompatRunSseStream = tokio_stream::wrappers::ReceiverStream<Result<Event, Infallible>>;

pub(crate) async fn start_openai_run_stream(
    state: Arc<ApiState>,
    run: NativeRunResult,
    model: String,
) -> Result<Response, NativeApiError> {
    start_compatible_run_stream(state, run, move |run, envelope| {
        openai_runtime_event_to_sse(run, &model, envelope)
    })
    .await
}

pub(crate) async fn start_anthropic_run_stream(
    state: Arc<ApiState>,
    run: NativeRunResult,
    model: String,
) -> Result<Response, NativeApiError> {
    let mut stateful_mapper = AnthropicStreamMapper::new(model);
    start_compatible_run_stream(state, run, move |run, envelope| {
        stateful_mapper.runtime_event_to_sse(run, envelope)
    })
    .await
}

async fn start_compatible_run_stream<F>(
    state: Arc<ApiState>,
    run: NativeRunResult,
    mut mapper: F,
) -> Result<Response, NativeApiError>
where
    F: FnMut(&NativeRunResult, RuntimeEventEnvelope) -> Vec<Result<Event, Infallible>>
        + Send
        + 'static,
{
    state
        .runtime_event_stream
        .open_run(
            run.id,
            control_plane::ports::RuntimeEventStreamPolicy::debug_default(),
        )
        .await
        .map_err(service_error)?;

    let (sender, receiver) = mpsc::channel(32);
    tokio::spawn(send_compatible_runtime_event_stream(
        state.runtime_event_stream.clone(),
        run.clone(),
        sender,
        move |run, envelope| mapper(run, envelope),
    ));

    let background_state = state.clone();
    tokio::spawn(async move {
        let runtime_service = OrchestrationRuntimeService::new(
            background_state.store.clone(),
            ApiProviderRuntime::new(background_state.provider_runtime.clone()),
            background_state.runtime_engine.clone(),
            background_state.provider_secret_master_key.clone(),
        )
        .with_runtime_event_stream(background_state.runtime_event_stream.clone());
        if let Err(runtime_error) = runtime_service
            .start_published_flow_run(StartPublishedFlowRunCommand {
                application_id: run.application_id,
                flow_run_id: run.id,
            })
            .await
        {
            let _ = background_state
                .runtime_event_stream
                .append(
                    run.id,
                    debug_stream_events::flow_failed(
                        run.id,
                        json!({ "message": runtime_error.to_string() }),
                    ),
                )
                .await;
            let _ = background_state
                .runtime_event_stream
                .close_run(
                    run.id,
                    control_plane::ports::RuntimeEventCloseReason::Failed,
                )
                .await;
        }
    });

    Ok(Sse::new(CompatRunSseStream::new(receiver))
        .keep_alive(KeepAlive::default())
        .into_response())
}

async fn send_compatible_runtime_event_stream<F>(
    stream: Arc<dyn RuntimeEventStream>,
    initial_run: NativeRunResult,
    sender: mpsc::Sender<Result<Event, Infallible>>,
    mut mapper: F,
) where
    F: FnMut(&NativeRunResult, RuntimeEventEnvelope) -> Vec<Result<Event, Infallible>>,
{
    let Ok(mut subscription) = stream.subscribe(initial_run.id, None).await else {
        return;
    };

    for event in subscription.replay {
        let is_terminal = is_public_terminal_runtime_event(&event.event_type);
        for sse in mapper(&initial_run, event) {
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
        for sse in mapper(&initial_run, event) {
            if sender.send(sse).await.is_err() {
                return;
            }
        }
        if is_terminal {
            return;
        }
    }
}

fn is_public_terminal_runtime_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "flow_finished" | "flow_failed" | "flow_cancelled" | "waiting_human" | "waiting_callback"
    )
}

fn openai_runtime_event_to_sse(
    initial_run: &NativeRunResult,
    model: &str,
    envelope: RuntimeEventEnvelope,
) -> Vec<Result<Event, Infallible>> {
    match envelope.event_type.as_str() {
        "text_delta" => vec![json_sse(json!({
            "id": format!("chatcmpl-{}", initial_run.id),
            "object": "chat.completion.chunk",
            "created": initial_run.created_at.unix_timestamp(),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": { "content": envelope.text.unwrap_or_default() },
                "finish_reason": null
            }]
        }))],
        "flow_finished" => vec![
            json_sse(json!({
                "id": format!("chatcmpl-{}", initial_run.id),
                "object": "chat.completion.chunk",
                "created": initial_run.created_at.unix_timestamp(),
                "model": model,
                "choices": [{
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }]
            })),
            done_sse(),
        ],
        "flow_failed" => vec![
            json_sse(json!({
                "error": {
                    "message": runtime_error_message(&envelope.payload),
                    "type": "server_error",
                    "param": null,
                    "code": "runtime_error"
                }
            })),
            done_sse(),
        ],
        "flow_cancelled" => vec![done_sse()],
        "waiting_human" | "waiting_callback" => vec![
            json_sse(json!({
                "error": {
                    "message": "waiting states are not supported by compatible endpoints; use the Native API to inspect and resume required_action runs",
                    "type": "invalid_request_error",
                    "param": null,
                    "code": "required_action_not_supported"
                }
            })),
            done_sse(),
        ],
        _ => Vec::new(),
    }
}

struct AnthropicStreamMapper {
    model: String,
    content_started: bool,
}

impl AnthropicStreamMapper {
    fn new(model: String) -> Self {
        Self {
            model,
            content_started: false,
        }
    }

    fn runtime_event_to_sse(
        &mut self,
        initial_run: &NativeRunResult,
        envelope: RuntimeEventEnvelope,
    ) -> Vec<Result<Event, Infallible>> {
        match envelope.event_type.as_str() {
            "flow_started" => vec![event_json_sse(
                "message_start",
                json!({
                    "type": "message_start",
                    "message": {
                        "id": format!("msg_{}", initial_run.id),
                        "type": "message",
                        "role": "assistant",
                        "model": self.model,
                        "content": [],
                        "stop_reason": null,
                        "usage": {"input_tokens": 0, "output_tokens": 0}
                    }
                }),
            )],
            "text_delta" => {
                let mut events = Vec::new();
                if !self.content_started {
                    self.content_started = true;
                    events.push(event_json_sse(
                        "content_block_start",
                        json!({
                            "type": "content_block_start",
                            "index": 0,
                            "content_block": {"type": "text", "text": ""}
                        }),
                    ));
                }
                events.push(event_json_sse(
                    "content_block_delta",
                    json!({
                        "type": "content_block_delta",
                        "index": 0,
                        "delta": {
                            "type": "text_delta",
                            "text": envelope.text.unwrap_or_default()
                        }
                    }),
                ));
                events
            }
            "flow_finished" => self.anthropic_stop_events(),
            "waiting_human" | "waiting_callback" => vec![event_json_sse(
                "error",
                json!({
                    "type": "error",
                    "error": {
                        "type": "required_action_not_supported",
                        "message": "waiting states are not supported by compatible endpoints; use the Native API to inspect and resume required_action runs"
                    }
                }),
            )],
            "flow_failed" => vec![event_json_sse(
                "error",
                json!({
                    "type": "error",
                    "error": {
                        "type": "api_error",
                        "message": runtime_error_message(&envelope.payload)
                    }
                }),
            )],
            "flow_cancelled" => self.anthropic_stop_events(),
            _ => Vec::new(),
        }
    }

    fn anthropic_stop_events(&mut self) -> Vec<Result<Event, Infallible>> {
        let mut events = Vec::new();
        if !self.content_started {
            self.content_started = true;
            events.push(event_json_sse(
                "content_block_start",
                json!({
                    "type": "content_block_start",
                    "index": 0,
                    "content_block": {"type": "text", "text": ""}
                }),
            ));
        }
        events.push(event_json_sse(
            "content_block_stop",
            json!({"type": "content_block_stop", "index": 0}),
        ));
        events.push(event_json_sse(
            "message_delta",
            json!({
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn"},
                "usage": {"output_tokens": 0}
            }),
        ));
        events.push(event_json_sse(
            "message_stop",
            json!({"type": "message_stop"}),
        ));
        events
    }
}

fn runtime_error_message(payload: &Value) -> String {
    payload
        .get("error")
        .or_else(|| payload.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("published run failed")
        .to_string()
}

fn json_sse(payload: Value) -> Result<Event, Infallible> {
    Ok(Event::default()
        .json_data(payload)
        .expect("compatible SSE payload should serialize"))
}

fn event_json_sse(event_name: &'static str, payload: Value) -> Result<Event, Infallible> {
    Ok(Event::default()
        .event(event_name)
        .json_data(payload)
        .expect("compatible SSE payload should serialize"))
}

fn done_sse() -> Result<Event, Infallible> {
    Ok(Event::default().data("[DONE]"))
}
