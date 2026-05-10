use control_plane::orchestration_runtime::{
    CompleteCallbackTaskCommand, ContinueFlowDebugRunCommand, OrchestrationRuntimeService,
    PrepareFlowDebugRunCommand, StartFlowDebugRunCommand, StartNodeDebugPreviewCommand,
};
use control_plane::{
    capability_plugin_runtime::CapabilityPluginRuntimePort,
    errors::ControlPlaneError,
    ports::{
        ApplicationRepository, FlowRepository, ModelDefinitionRepository, ModelProviderRepository,
        NodeContributionRepository, OrchestrationRuntimeRepository, PluginRepository,
        ProviderRuntimePort, RuntimeEventDurability, RuntimeEventEnvelope, RuntimeEventPayload,
        RuntimeEventSource, UpsertDataModelSideEffectReceiptInput,
    },
};
use serde_json::{json, Value};
use time::Duration;
use uuid::Uuid;

fn runtime_text_delta(run_id: Uuid, node_run_id: Uuid, text: &str) -> RuntimeEventEnvelope {
    runtime_text_delta_with_payload(
        run_id,
        1,
        serde_json::json!({
            "type": "text_delta",
            "node_run_id": node_run_id,
            "node_id": "node-llm",
            "text": text,
        }),
    )
}

fn runtime_text_delta_with_payload(
    run_id: Uuid,
    sequence: i64,
    payload: Value,
) -> RuntimeEventEnvelope {
    RuntimeEventEnvelope::new(
        run_id,
        sequence,
        RuntimeEventPayload {
            event_type: "text_delta".to_string(),
            source: RuntimeEventSource::Provider,
            durability: RuntimeEventDurability::DurableRequired,
            persist_required: true,
            trace_visible: false,
            payload,
        },
    )
}

fn runtime_reasoning_delta(run_id: Uuid, node_run_id: Uuid, text: &str) -> RuntimeEventEnvelope {
    RuntimeEventEnvelope::new(
        run_id,
        1,
        RuntimeEventPayload {
            event_type: "reasoning_delta".to_string(),
            source: RuntimeEventSource::Provider,
            durability: RuntimeEventDurability::DurableRequired,
            persist_required: true,
            trace_visible: false,
            payload: serde_json::json!({
                "type": "reasoning_delta",
                "node_run_id": node_run_id,
                "node_id": "node-llm",
                "text": text,
            }),
        },
    )
}

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
    assert_eq!(
        runtime_events[0].layer,
        domain::RuntimeEventLayer::RuntimeItem
    );
    assert_eq!(runtime_events[0].source, domain::RuntimeEventSource::Host);
    assert_eq!(
        runtime_events[0].visibility,
        domain::RuntimeEventVisibility::Workspace
    );
    assert_eq!(
        runtime_events[0].durability,
        domain::RuntimeEventDurability::Durable
    );
    assert_eq!(runtime_events[0].payload["text"], "退款摘要");
    let run_events = repository.events_for_flow_run(run_id);
    assert!(run_events.is_empty());
}

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
    assert_eq!(
        runtime_events[1].layer,
        domain::RuntimeEventLayer::AgentTransition
    );
}

#[tokio::test]
async fn start_node_debug_preview_creates_run_node_run_and_events() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(outcome.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(outcome.node_run.status, domain::NodeRunStatus::Succeeded);
    assert!(outcome
        .events
        .iter()
        .any(|event| event.event_type == "node_preview_completed"));
}

#[tokio::test]
async fn start_node_debug_preview_uses_selected_source_provider_instance() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_multi_instance_provider_flow("Support Agent")
        .await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(
        outcome.preview_payload["metrics_payload"]["provider_instance_id"],
        serde_json::json!(seeded.source_provider_instance_id.to_string())
    );
    assert_eq!(
        outcome.node_run.output_payload["text"],
        serde_json::json!("echo:gpt-5.4-mini:请总结退款政策")
    );
    assert_eq!(
        outcome.node_run.output_payload["usage"]["total_tokens"],
        serde_json::json!(12)
    );
    assert_eq!(
        outcome.node_run.metrics_payload["runtime"]["usage"]["total_tokens"],
        serde_json::json!(12)
    );
    assert!(outcome.node_run.output_payload.get("route").is_none());
    assert!(outcome
        .node_run
        .output_payload
        .get("provider_route")
        .is_some());
    assert_eq!(
        outcome.flow_run.output_payload,
        outcome.node_run.output_payload
    );
    for hidden_key in [
        "resolved_inputs",
        "rendered_templates",
        "output_contract",
        "metrics_payload",
        "debug_payload",
        "provider_events",
    ] {
        assert!(
            outcome.node_run.output_payload.get(hidden_key).is_none(),
            "{hidden_key} must not leak into node preview output"
        );
        assert!(
            outcome.flow_run.output_payload.get(hidden_key).is_none(),
            "{hidden_key} must not leak into flow preview output"
        );
    }
    assert_eq!(
        outcome.node_run.debug_payload["assistant_message"]["content"],
        serde_json::json!("echo:gpt-5.4-mini:请总结退款政策")
    );
    assert!(outcome.node_run.debug_payload["provider_events"]
        .as_array()
        .is_some_and(|events| !events.is_empty()));
}

#[tokio::test]
async fn start_node_debug_preview_uses_request_document_snapshot() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "draft prompt" }
            }),
            document_snapshot: Some(serde_json::json!({
                "schemaVersion": "1flowbase.flow/v2",
                "meta": {
                    "flowId": seeded.flow_id.to_string(),
                    "name": "Support Agent",
                    "description": "",
                    "tags": []
                },
                "graph": {
                    "nodes": [
                        {
                            "id": "node-start",
                            "type": "start",
                            "alias": "Start",
                            "description": "",
                            "containerId": null,
                            "position": { "x": 0, "y": 0 },
                            "configVersion": 1,
                            "config": {},
                            "bindings": {},
                            "outputs": []
                        },
                        {
                            "id": "node-llm",
                            "type": "llm",
                            "alias": "LLM",
                            "description": "",
                            "containerId": null,
                            "position": { "x": 240, "y": 0 },
                            "configVersion": 1,
                            "config": {
                                "model_provider": {
                                    "provider_code": "fixture_provider",
                                    "source_instance_id": seeded.source_provider_instance_id.to_string(),
                                    "model_id": "gpt-5.4-mini"
                                }
                            },
                            "bindings": {
                                "prompt_messages": { "kind": "prompt_messages", "value": [{ "id": "user-1", "role": "user", "content": { "kind": "templated_text", "value": "snapshot {{node-start.query}}" } }] }
                            },
                            "outputs": [{ "key": "text", "title": "模型输出", "valueType": "string" }]
                        }
                    ],
                    "edges": [
                        {
                            "id": "edge-start-llm",
                            "source": "node-start",
                            "target": "node-llm",
                            "sourceHandle": null,
                            "targetHandle": null,
                            "containerId": null,
                            "points": []
                        }
                    ]
                },
                "editor": {
                    "viewport": { "x": 0, "y": 0, "zoom": 1 },
                    "annotations": [],
                    "activeContainerPath": []
                }
            })),
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(
        outcome.preview_payload["node_output"]["text"],
        serde_json::json!("echo:gpt-5.4-mini:snapshot draft prompt")
    );
}

#[tokio::test]
async fn start_node_debug_preview_records_provider_invocation_duration() {
    let service = OrchestrationRuntimeService::for_tests_with_provider_delay(
        std::time::Duration::from_millis(50),
    );
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let outcome = service
        .start_node_debug_preview(StartNodeDebugPreviewCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            node_id: "node-llm".to_string(),
            input_payload: serde_json::json!({
                "node-start": { "query": "请总结退款政策" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let elapsed = outcome
        .node_run
        .finished_at
        .expect("node preview should finish")
        - outcome.node_run.started_at;

    assert!(elapsed >= Duration::milliseconds(45));
}

#[tokio::test]
async fn start_flow_debug_run_returns_running_detail_before_background_continuation() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_plugin_node_flow("Capability Agent")
        .await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({
                "node-start": { "query": "world" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(started.flow_run.status, domain::FlowRunStatus::Running);
    assert!(started.node_runs.is_empty());
    assert_eq!(started.events[0].event_type, "flow_run_started");
}

#[tokio::test]
async fn live_provider_delta_is_appended_to_runtime_event_stream() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert!(stream
        .events()
        .iter()
        .any(|event| event.event_type == "text_delta"));
}

#[tokio::test]
async fn flow_debug_run_resolves_system_variables_from_run_context() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let editor_state = service
        .editor_state_for_tests(seeded.application_id, seeded.actor_user_id)
        .await;
    let mut document = editor_state.draft.document.clone();

    document["graph"]["nodes"][1]["bindings"]["prompt_messages"]["value"][0]["content"]["value"] =
        json!("{{sys.user_id}}/{{sys.app_id}}/{{sys.workflow_id}}/{{sys.workflow_run_id}}");

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            document_snapshot: Some(document),
            debug_session_id: None,
        })
        .await
        .unwrap();

    let completed = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();
    let llm_run = completed
        .node_runs
        .iter()
        .find(|run| run.node_id == "node-llm")
        .expect("llm node run");
    let content = llm_run.input_payload["prompt_messages"][0]["content"]
        .as_str()
        .expect("rendered prompt content");

    assert!(content.contains(&seeded.actor_user_id.to_string()));
    assert!(content.contains(&seeded.application_id.to_string()));
    assert!(content.contains(&seeded.flow_id.to_string()));
    assert!(content.contains(&detail.flow_run.id.to_string()));
}

#[tokio::test]
async fn flow_debug_run_resolves_application_environment_variables() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    service
        .replace_application_environment_variables_for_tests(
            seeded.actor_user_id,
            seeded.application_id,
            vec![control_plane::ports::ApplicationEnvironmentVariableInput {
                name: "ApiBaseUrl".to_string(),
                value_type: "string".to_string(),
                value: json!("https://api.example.com"),
                description: "当前应用 API 地址".to_string(),
            }],
        )
        .await;
    let editor_state = service
        .editor_state_for_tests(seeded.application_id, seeded.actor_user_id)
        .await;
    let mut document = editor_state.draft.document.clone();

    document["graph"]["nodes"][1]["bindings"]["prompt_messages"]["value"][0]["content"]["value"] =
        json!("call {{env.ApiBaseUrl}}");

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({ "node-start": { "query": "hello" } }),
            document_snapshot: Some(document),
            debug_session_id: None,
        })
        .await
        .unwrap();

    let completed = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();
    let llm_run = completed
        .node_runs
        .iter()
        .find(|run| run.node_id == "node-llm")
        .expect("llm node run");

    assert_eq!(
        llm_run.input_payload["prompt_messages"][0]["content"].as_str(),
        Some("call https://api.example.com")
    );
}

#[tokio::test]
async fn live_provider_reasoning_delta_is_appended_to_runtime_event_stream() {
    let service = OrchestrationRuntimeService::for_tests_with_provider_events(vec![
        plugin_framework::provider_contract::ProviderStreamEvent::ReasoningDelta {
            delta: "先分析".into(),
        },
        plugin_framework::provider_contract::ProviderStreamEvent::TextDelta {
            delta: "结果".into(),
        },
    ]);
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    let llm_node = detail
        .node_runs
        .iter()
        .find(|node_run| node_run.node_id == "node-llm")
        .expect("llm node run should be persisted");
    assert_eq!(llm_node.output_payload["text"], "<think>先分析</think>结果");
    assert!(llm_node.output_payload.get("reasoning_content").is_none());
    assert!(llm_node.output_payload.get("attempts").is_none());
    assert!(llm_node.output_payload.get("event_count").is_none());
    assert!(llm_node.output_payload.get("provider_code").is_none());
    assert_eq!(
        llm_node.output_payload["provider_route"]["provider_code"],
        "fixture_provider"
    );
    assert!(llm_node.debug_payload.get("reasoning_content").is_none());
    assert!(llm_node.debug_payload.get("provider_route").is_none());

    let events = stream.events();
    assert!(events
        .iter()
        .any(|event| event.event_type == "reasoning_delta" && event.payload["text"] == "先分析"));
    assert!(events.iter().any(|event| event.event_type == "text_delta"));
}

#[tokio::test]
async fn live_provider_text_delta_with_think_tags_is_split_into_reasoning_and_answer() {
    let service = OrchestrationRuntimeService::for_tests_with_provider_events(vec![
        plugin_framework::provider_contract::ProviderStreamEvent::TextDelta {
            delta: "<think>先分析".into(),
        },
        plugin_framework::provider_contract::ProviderStreamEvent::TextDelta {
            delta: "用户问题</think>正式回答".into(),
        },
    ]);
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    let events = stream.events();
    let reasoning_text = events
        .iter()
        .filter(|event| event.event_type == "reasoning_delta")
        .filter_map(|event| event.payload["text"].as_str())
        .collect::<String>();
    let answer_text = events
        .iter()
        .filter(|event| event.event_type == "text_delta")
        .filter_map(|event| event.payload["text"].as_str())
        .collect::<String>();

    assert_eq!(reasoning_text, "先分析用户问题");
    assert_eq!(answer_text, "正式回答");
    assert!(!events.iter().any(|event| event
        .payload
        .get("text")
        .and_then(serde_json::Value::as_str)
        .is_some_and(|text| text.contains("<think>") || text.contains("</think>"))));
}

#[tokio::test]
async fn fast_stream_provider_events_are_durably_persisted_to_runtime_observability() {
    use plugin_framework::provider_contract::{
        ProviderFinishReason, ProviderStreamEvent, ProviderToolCall, ProviderUsage,
    };

    let service = OrchestrationRuntimeService::for_tests_with_provider_events(vec![
        ProviderStreamEvent::TextDelta {
            delta: "hello".to_string(),
        },
        ProviderStreamEvent::ToolCallCommit {
            call: ProviderToolCall {
                id: "call-1".to_string(),
                name: "lookup_policy".to_string(),
                arguments: json!({ "query": "refund" }),
            },
        },
        ProviderStreamEvent::UsageSnapshot {
            usage: ProviderUsage {
                input_tokens: Some(10),
                output_tokens: Some(5),
                reasoning_tokens: None,
                input_cache_hit_tokens: None,
                input_cache_miss_tokens: None,
                cache_read_tokens: None,
                cache_write_tokens: None,
                total_tokens: Some(15),
            },
        },
        ProviderStreamEvent::Finish {
            reason: ProviderFinishReason::Stop,
        },
    ]);
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream);

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    let runtime_event_types = service
        .list_runtime_events(detail.flow_run.id, 0)
        .await
        .into_iter()
        .map(|event| event.event_type)
        .collect::<Vec<_>>();
    assert!(
        runtime_event_types.iter().any(|event_type| event_type == "text_delta"),
        "provider text deltas should still be written to durable runtime_events: {runtime_event_types:?}"
    );
    assert!(
        runtime_event_types
            .iter()
            .any(|event_type| event_type == "tool_call_commit"),
        "provider tool commits should still be written to durable runtime_events: {runtime_event_types:?}"
    );
    assert!(
        runtime_event_types
            .iter()
            .any(|event_type| event_type == "usage_snapshot"),
        "provider usage snapshots should still be written to durable runtime_events: {runtime_event_types:?}"
    );
    assert!(
        runtime_event_types.iter().any(|event_type| event_type == "finish"),
        "provider finish events should still be written to durable runtime_events: {runtime_event_types:?}"
    );

    let capability_invocations = service
        .list_capability_invocations(detail.flow_run.id)
        .await;
    assert!(
        capability_invocations
            .iter()
            .any(|invocation| invocation.capability_id.contains("lookup_policy")),
        "provider tool commits should still create capability intent records: {capability_invocations:?}"
    );
}

#[tokio::test]
async fn provider_error_after_live_delta_drains_runtime_event_stream_forwarding() {
    let service = OrchestrationRuntimeService::for_tests_with_live_events_then_error(vec![
        plugin_framework::provider_contract::ProviderStreamEvent::TextDelta {
            delta: "partial before error".to_string(),
        },
    ]);
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let failed_detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(failed_detail.flow_run.status, domain::FlowRunStatus::Failed);
    assert!(failed_detail.flow_run.error_payload.is_some_and(|payload| {
        payload["message"]
            .as_str()
            .is_some_and(|message| message.contains("provider failed after live events"))
    }));
    let event_types = stream
        .events()
        .into_iter()
        .map(|event| event.event_type)
        .collect::<Vec<_>>();
    let text_delta_index = event_types
        .iter()
        .position(|event_type| event_type == "text_delta")
        .expect("text_delta should be appended before provider error returns");
    let flow_failed_index = event_types
        .iter()
        .position(|event_type| event_type == "flow_failed")
        .expect("failed run should append flow_failed");
    assert!(
        text_delta_index < flow_failed_index,
        "text_delta should be drained before flow_failed: {event_types:?}"
    );
}

#[tokio::test]
async fn provider_error_after_live_delta_keeps_partial_output_out_of_run_state() {
    let service = OrchestrationRuntimeService::for_tests_with_live_events_then_error(vec![
        plugin_framework::provider_contract::ProviderStreamEvent::TextDelta {
            delta: "partial before error".to_string(),
        },
    ]);
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream);

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let failed_detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(failed_detail.flow_run.status, domain::FlowRunStatus::Failed);
    assert_eq!(failed_detail.flow_run.output_payload, json!({}));
    let llm_node = node_run(&failed_detail, "node-llm");
    assert_eq!(llm_node.status, domain::NodeRunStatus::Failed);
    assert_eq!(llm_node.output_payload, json!({}));
    assert!(llm_node.output_payload.get("text").is_none());
    assert!(llm_node.output_payload.get("usage").is_none());
    assert!(llm_node.output_payload.get("tool_calls").is_none());
    assert!(failed_detail
        .node_runs
        .iter()
        .all(|node_run| node_run.node_id != "node-answer"));
}

#[tokio::test]
async fn live_debug_checkpoint_snapshot_stores_llm_output_metrics_without_process_events() {
    use plugin_framework::provider_contract::{
        ProviderFinishReason, ProviderStreamEvent, ProviderToolCall, ProviderUsage,
    };

    let service = OrchestrationRuntimeService::for_tests_with_provider_events(vec![
        ProviderStreamEvent::TextDelta {
            delta: "visible output".to_string(),
        },
        ProviderStreamEvent::ToolCallCommit {
            call: ProviderToolCall {
                id: "tool-call-1".to_string(),
                name: "lookup_policy".to_string(),
                arguments: json!({ "query": "refund" }),
            },
        },
        ProviderStreamEvent::UsageSnapshot {
            usage: ProviderUsage {
                input_tokens: Some(5),
                output_tokens: Some(7),
                reasoning_tokens: None,
                input_cache_hit_tokens: None,
                input_cache_miss_tokens: None,
                cache_read_tokens: None,
                cache_write_tokens: None,
                total_tokens: Some(12),
            },
        },
        ProviderStreamEvent::Finish {
            reason: ProviderFinishReason::Stop,
        },
    ]);
    let seeded = service
        .seed_application_with_human_input_flow("Support Agent")
        .await;

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({
                "node-start": { "query": "请总结退款政策" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let waiting_detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(
        waiting_detail.flow_run.status,
        domain::FlowRunStatus::WaitingHuman
    );
    assert_eq!(waiting_detail.flow_run.output_payload, json!({}));
    let llm_node = node_run(&waiting_detail, "node-llm");
    assert_eq!(
        llm_node.output_payload["text"],
        json!("echo:gpt-5.4-mini:请总结退款政策")
    );
    assert_eq!(
        llm_node.output_payload["usage"],
        llm_node.metrics_payload["usage"]
    );
    assert!(llm_node.output_payload.get("route").is_none());
    assert!(llm_node.output_payload.get("provider_route").is_some());
    assert!(llm_node.metrics_payload.get("usage").is_some());

    let snapshot = &waiting_detail
        .checkpoints
        .last()
        .expect("waiting human checkpoint should be stored")
        .variable_snapshot;
    let llm_snapshot = snapshot
        .get("node-llm")
        .expect("llm output should be available to waiting node");
    assert_eq!(
        llm_snapshot["text"],
        json!("echo:gpt-5.4-mini:请总结退款政策")
    );
    assert_eq!(llm_snapshot["usage"]["total_tokens"], json!(12));
    for hidden_key in [
        "tool_calls",
        "error",
        "__context_projection_id",
        "__attempt_ids",
    ] {
        assert!(
            llm_node.output_payload.get(hidden_key).is_none(),
            "{hidden_key} must not be persisted in node output"
        );
        assert!(
            llm_snapshot.get(hidden_key).is_none(),
            "{hidden_key} must not be persisted in checkpoint variables"
        );
    }
}

#[tokio::test]
async fn successful_live_debug_run_emits_flow_lifecycle_and_closes_runtime_stream() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let detail = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: detail.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    let event_types = stream
        .events()
        .into_iter()
        .map(|event| event.event_type)
        .collect::<Vec<_>>();
    assert!(event_types
        .iter()
        .any(|event_type| event_type == "flow_started"));
    assert!(event_types
        .iter()
        .any(|event_type| event_type == "flow_finished"));
    assert_eq!(
        stream.close_calls(),
        vec![(
            detail.flow_run.id,
            crate::ports::RuntimeEventCloseReason::Finished
        )]
    );
}

#[tokio::test]
async fn opens_flow_debug_run_shell_without_compiling_plan() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let shell = service
        .open_flow_debug_run_shell(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(shell.status, domain::FlowRunStatus::Queued);
    assert_eq!(shell.compiled_plan_id, None);
}

#[tokio::test]
async fn prepare_flow_debug_run_rejects_shell_input_mismatch() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let shell = service
        .open_flow_debug_run_shell(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "input A" } }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let error = service
        .prepare_flow_debug_run_from_shell(PrepareFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            flow_run_id: shell.id,
            input_payload: serde_json::json!({ "node-start": { "query": "input B" } }),
            document_snapshot: None,
            debug_session_id: String::new(),
        })
        .await
        .unwrap_err();

    assert!(error
        .to_string()
        .contains("flow debug run shell does not match prepare command"));

    let detail = service
        .application_run_detail(seeded.application_id, shell.id)
        .await;
    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Queued);
    assert_eq!(detail.flow_run.compiled_plan_id, None);
    assert!(detail.events.is_empty());
}

#[tokio::test]
async fn concurrent_prepare_flow_debug_run_does_not_fail_attached_shell() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let input_payload = serde_json::json!({ "node-start": { "query": "hello" } });
    let shell = service
        .open_flow_debug_run_shell(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: input_payload.clone(),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let first_command = PrepareFlowDebugRunCommand {
        actor_user_id: seeded.actor_user_id,
        application_id: seeded.application_id,
        flow_run_id: shell.id,
        input_payload: input_payload.clone(),
        document_snapshot: None,
        debug_session_id: String::new(),
    };
    let second_command = PrepareFlowDebugRunCommand {
        actor_user_id: seeded.actor_user_id,
        application_id: seeded.application_id,
        flow_run_id: shell.id,
        input_payload,
        document_snapshot: None,
        debug_session_id: String::new(),
    };

    let (first, second) = tokio::join!(
        service.prepare_flow_debug_run_from_shell(first_command),
        service.prepare_flow_debug_run_from_shell(second_command),
    );

    assert_eq!(
        [first.is_ok(), second.is_ok()]
            .into_iter()
            .filter(|succeeded| *succeeded)
            .count(),
        1
    );

    let detail = service
        .application_run_detail(seeded.application_id, shell.id)
        .await;
    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Running);
    assert!(detail.flow_run.compiled_plan_id.is_some());
}

#[tokio::test]
async fn start_flow_debug_run_marks_shell_failed_when_preparation_fails() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;

    let error = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: Some(serde_json::json!({})),
            debug_session_id: None,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("schemaVersion missing"));

    let runs = service.application_runs(seeded.application_id).await;
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, domain::FlowRunStatus::Failed);

    let detail = service
        .application_run_detail(seeded.application_id, runs[0].id)
        .await;
    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    assert!(detail.flow_run.error_payload.is_some());
    assert!(detail
        .events
        .iter()
        .any(|event| event.event_type == "flow_run_failed"));
}

#[tokio::test]
async fn failed_prepare_emits_flow_failed_lifecycle_and_closes_runtime_stream() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Support Agent").await;
    let stream =
        std::sync::Arc::new(crate::_tests::support::RecordingRuntimeEventStream::default());
    let service = service.with_runtime_event_stream(stream.clone());

    let error = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({ "node-start": { "query": "hello" } }),
            document_snapshot: Some(serde_json::json!({})),
            debug_session_id: None,
        })
        .await
        .unwrap_err();

    assert!(error.to_string().contains("schemaVersion missing"));

    let runs = service.application_runs(seeded.application_id).await;
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].status, domain::FlowRunStatus::Failed);

    let event_types = stream
        .events()
        .into_iter()
        .map(|event| event.event_type)
        .collect::<Vec<_>>();
    assert!(event_types
        .iter()
        .any(|event_type| event_type == "flow_failed"));
    assert_eq!(
        stream.close_calls(),
        vec![(runs[0].id, crate::ports::RuntimeEventCloseReason::Failed)]
    );
}

#[tokio::test]
async fn start_flow_debug_run_records_gateway_billing_audit_trace() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_plugin_node_flow("Capability Agent")
        .await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({
                "node-start": { "query": "world" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();

    let billing_event = started
        .events
        .iter()
        .find(|event| event.event_type == "gateway_billing_session_reserved")
        .expect("gateway billing event should be recorded before continuation");

    assert_eq!(
        billing_event.payload["billing_session"]["status"].as_str(),
        Some("reserved")
    );
    assert_eq!(
        billing_event.payload["cost_ledger"]["cost_status"].as_str(),
        Some("pending_usage")
    );
    assert_eq!(
        billing_event.payload["credit_ledger"]["transaction_type"].as_str(),
        Some("reserve")
    );
    assert_eq!(
        billing_event.payload["route_trace"]["trust_level"].as_str(),
        Some("host_fact")
    );
    assert_eq!(
        billing_event.payload["audit_hashes"]
            .as_array()
            .map(|hashes| hashes.len()),
        Some(3)
    );
}

#[tokio::test]
async fn continue_flow_debug_run_executes_plugin_node_through_capability_runtime() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service
        .seed_application_with_plugin_node_flow("Capability Agent")
        .await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: serde_json::json!({
                "node-start": { "query": "world" }
            }),
            document_snapshot: None,
            debug_session_id: None,
        })
        .await
        .unwrap();
    let detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: started.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    assert_eq!(detail.node_runs[1].node_type, "plugin_node");
    assert_eq!(detail.node_runs[1].output_payload["answer"], "world");
}

#[tokio::test]
async fn orchestration_runtime_data_model_node_compiles_with_code_and_action() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({}),
            document_snapshot: Some(data_model_flow_document(
                seeded.flow_id,
                vec![data_model_node("node-list", "list", json!({}), json!({}))],
                vec![],
            )),
            debug_session_id: None,
        })
        .await
        .unwrap();

    assert_eq!(started.flow_run.status, domain::FlowRunStatus::Running);
}

#[tokio::test]
async fn orchestration_runtime_data_model_list_returns_records_and_total() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            input_payload: json!({}),
            document_snapshot: Some(data_model_flow_document(
                seeded.flow_id,
                vec![
                    data_model_node(
                        "node-create",
                        "create",
                        json!({ "payload": { "title": "Order A", "status": "draft" } }),
                        json!({}),
                    ),
                    data_model_node("node-list", "list", json!({}), json!({})),
                ],
                vec![("node-create", "node-list")],
            )),
            debug_session_id: None,
        })
        .await
        .unwrap();
    let detail = service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id: seeded.application_id,
            flow_run_id: started.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .unwrap();

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    let list_node = node_run(&detail, "node-list");
    assert_eq!(list_node.output_payload["total"], json!(1));
    assert_eq!(
        list_node.output_payload["records"][0]["title"],
        json!("Order A")
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_get_requires_record_id() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node("node-get", "get", json!({}), json!({}))],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let get_node = node_run(&detail, "node-get");
    assert_eq!(get_node.status, domain::NodeRunStatus::Failed);
    assert!(get_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("record_id")));
}

#[tokio::test]
async fn orchestration_runtime_data_model_create_rejects_non_object_payload() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({ "payload": "not-object" }),
            json!({}),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let create_node = node_run(&detail, "node-create");
    assert_eq!(create_node.status, domain::NodeRunStatus::Failed);
    assert!(create_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("payload")));
}

#[tokio::test]
async fn orchestration_runtime_data_model_write_requires_side_effect_policy() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({
                "payload": { "title": "Order A", "status": "draft" },
                "side_effect_policy": "disabled"
            }),
            json!({}),
        )],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let create_node = node_run(&detail, "node-create");
    assert_eq!(create_node.status, domain::NodeRunStatus::Failed);
    assert!(create_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("DATA_MODEL_SIDE_EFFECT_DISABLED")));
}

#[tokio::test]
async fn orchestration_runtime_data_model_confirm_each_run_waits_for_callback() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({
                "payload": { "title": "Order A", "status": "draft" },
                "side_effect_policy": "confirm_each_run"
            }),
            json!({}),
        )],
        vec![],
    )
    .await;

    assert_eq!(
        detail.flow_run.status,
        domain::FlowRunStatus::WaitingCallback
    );
    let create_node = node_run(&detail, "node-create");
    assert_eq!(create_node.status, domain::NodeRunStatus::WaitingCallback);
    assert_eq!(create_node.output_payload, json!({}));
    assert_eq!(
        create_node.debug_payload["side_effect_policy"],
        json!("confirm_each_run")
    );
    assert!(create_node.debug_payload["idempotency_key"]
        .as_str()
        .is_some_and(|value| value.starts_with("data_model:")));
    assert_eq!(
        create_node.debug_payload["payload_hash"]
            .as_str()
            .map(|value| value.starts_with("sha256:")),
        Some(true)
    );
    assert_eq!(detail.checkpoints.len(), 1);
    assert_eq!(
        detail.checkpoints[0].status,
        "waiting_data_model_side_effect_confirmation"
    );
    assert_eq!(detail.callback_tasks.len(), 1);
    assert_eq!(
        detail.callback_tasks[0].callback_kind,
        "data_model_side_effect_confirmation"
    );
    assert_eq!(
        detail.callback_tasks[0].request_payload["node_id"],
        json!("node-create")
    );
    assert_eq!(
        detail.callback_tasks[0].request_payload["run_id"],
        json!(detail.flow_run.id)
    );
    assert_eq!(
        detail.callback_tasks[0].request_payload["actor_user_id"],
        json!(seeded.actor_user_id)
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_confirmed_callback_executes_write_once() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let waiting = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({
                "payload": { "title": "Order A", "status": "draft" },
                "side_effect_policy": "confirm_each_run"
            }),
            json!({}),
        )],
        vec![],
    )
    .await;

    let completed = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: waiting.callback_tasks[0].id,
            response_payload: json!({ "approved": true }),
        })
        .await
        .unwrap();

    assert_eq!(completed.callback_tasks[0].status.as_str(), "completed");
    assert_eq!(completed.flow_run.status, domain::FlowRunStatus::Succeeded);
    let create_node = node_run(&completed, "node-create");
    assert_eq!(create_node.status, domain::NodeRunStatus::Succeeded);
    assert_eq!(
        create_node.output_payload["record"]["title"],
        json!("Order A")
    );
    assert!(create_node
        .output_payload
        .get("__side_effect_receipt")
        .is_none());
    assert_eq!(
        create_node.metrics_payload["side_effect_receipt"]["status"],
        json!("succeeded")
    );
    assert_eq!(
        create_node.metrics_payload["side_effect_replayed"],
        json!(false)
    );

    let duplicate_error = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: waiting.callback_tasks[0].id,
            response_payload: json!({ "approved": true }),
        })
        .await
        .unwrap_err();
    assert!(matches!(
        duplicate_error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::Conflict("callback_task_not_pending"))
    ));
}

#[tokio::test]
async fn orchestration_runtime_data_model_confirmed_callback_replays_same_run_receipt() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let waiting = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({
                "payload": { "title": "Order A", "status": "draft" },
                "side_effect_policy": "confirm_each_run"
            }),
            json!({}),
        )],
        vec![],
    )
    .await;
    let create_node = node_run(&waiting, "node-create");
    let callback_payload = &waiting.callback_tasks[0].request_payload;
    service
        .upsert_data_model_side_effect_receipt_for_tests(&UpsertDataModelSideEffectReceiptInput {
            workspace_id: Uuid::nil(),
            application_id: seeded.application_id,
            draft_id: waiting.flow_run.draft_id,
            flow_run_id: waiting.flow_run.id,
            node_run_id: create_node.id,
            node_id: "node-create".to_string(),
            action: "create".to_string(),
            model_code: "orders".to_string(),
            record_id: Some("record-from-receipt".to_string()),
            deleted_id: None,
            affected_count: 1,
            idempotency_key: callback_payload["idempotency_key"]
                .as_str()
                .expect("callback idempotency key")
                .to_string(),
            payload_hash: callback_payload["payload_hash"]
                .as_str()
                .expect("callback payload hash")
                .to_string(),
            actor_user_id: seeded.actor_user_id,
            scope_id: Uuid::nil(),
            status: "succeeded".to_string(),
            output_payload: json!({
                "record": {
                    "id": "record-from-receipt",
                    "title": "Order From Receipt"
                }
            }),
        })
        .await;

    let completed = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: waiting.callback_tasks[0].id,
            response_payload: json!({ "approved": true }),
        })
        .await
        .unwrap();

    let create_node = node_run(&completed, "node-create");
    assert_eq!(
        create_node.output_payload["record"]["id"],
        json!("record-from-receipt")
    );
    assert_eq!(
        create_node.metrics_payload["side_effect_replayed"],
        json!(true)
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_confirmation_rejects_different_actor() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let waiting = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node(
            "node-create",
            "create",
            json!({
                "payload": { "title": "Order A", "status": "draft" },
                "side_effect_policy": "confirm_each_run"
            }),
            json!({}),
        )],
        vec![],
    )
    .await;

    let error = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: Uuid::now_v7(),
            application_id: seeded.application_id,
            callback_task_id: waiting.callback_tasks[0].id,
            response_payload: json!({ "approved": true }),
        })
        .await
        .unwrap_err();
    assert!(matches!(
        error.downcast_ref::<ControlPlaneError>(),
        Some(ControlPlaneError::PermissionDenied(
            "data_model_side_effect_confirmation_actor"
        ))
    ));

    let completed = service
        .complete_callback_task(CompleteCallbackTaskCommand {
            actor_user_id: seeded.actor_user_id,
            application_id: seeded.application_id,
            callback_task_id: waiting.callback_tasks[0].id,
            response_payload: json!({ "approved": true }),
        })
        .await
        .unwrap();
    assert_eq!(completed.flow_run.status, domain::FlowRunStatus::Succeeded);
}

#[tokio::test]
async fn orchestration_runtime_data_model_update_rejects_non_object_payload() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![
            data_model_node(
                "node-create",
                "create",
                json!({ "payload": { "title": "Order A", "status": "draft" } }),
                json!({}),
            ),
            data_model_node(
                "node-update",
                "update",
                json!({ "payload": "not-object" }),
                json!({ "record_id": selector_binding(["node-create", "record", "id"]) }),
            ),
        ],
        vec![("node-create", "node-update")],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let update_node = node_run(&detail, "node-update");
    assert_eq!(update_node.status, domain::NodeRunStatus::Failed);
    assert!(update_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("payload")));
}

#[tokio::test]
async fn orchestration_runtime_data_model_create_update_delete_runtime_crud() {
    let service = OrchestrationRuntimeService::for_tests();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![
            data_model_node(
                "node-create",
                "create",
                json!({ "payload": { "title": "Order A", "status": "draft" } }),
                json!({}),
            ),
            data_model_node(
                "node-update",
                "update",
                json!({ "payload": { "status": "paid" } }),
                json!({ "record_id": selector_binding(["node-create", "record", "id"]) }),
            ),
            data_model_node(
                "node-delete",
                "delete",
                json!({}),
                json!({ "record_id": selector_binding(["node-update", "record", "id"]) }),
            ),
        ],
        vec![
            ("node-create", "node-update"),
            ("node-update", "node-delete"),
        ],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Succeeded);
    let create_node = node_run(&detail, "node-create");
    let update_node = node_run(&detail, "node-update");
    let delete_node = node_run(&detail, "node-delete");
    assert_eq!(
        create_node.output_payload["record"]["title"],
        json!("Order A")
    );
    assert_eq!(
        update_node.output_payload["record"]["status"],
        json!("paid")
    );
    assert_eq!(
        delete_node.output_payload["deleted_id"],
        update_node.output_payload["record"]["id"]
    );
}

#[tokio::test]
async fn orchestration_runtime_data_model_permission_denied_records_node_error() {
    let service = OrchestrationRuntimeService::for_tests_without_data_model_scope_grant();
    let seeded = service.seed_application_with_flow("Data Model Agent").await;

    let detail = run_data_model_flow(
        &service,
        seeded.actor_user_id,
        seeded.application_id,
        seeded.flow_id,
        vec![data_model_node("node-list", "list", json!({}), json!({}))],
        vec![],
    )
    .await;

    assert_eq!(detail.flow_run.status, domain::FlowRunStatus::Failed);
    let list_node = node_run(&detail, "node-list");
    assert_eq!(list_node.status, domain::NodeRunStatus::Failed);
    assert!(list_node
        .error_payload
        .as_ref()
        .and_then(|payload| payload["message"].as_str())
        .is_some_and(|message| message.contains("permission denied")));
}

async fn run_data_model_flow(
    service: &OrchestrationRuntimeService<impl RuntimeRepositoryBounds, impl RuntimeHostBounds>,
    actor_user_id: Uuid,
    application_id: Uuid,
    flow_id: Uuid,
    nodes: Vec<Value>,
    edges: Vec<(&str, &str)>,
) -> domain::ApplicationRunDetail {
    let started = service
        .start_flow_debug_run(StartFlowDebugRunCommand {
            actor_user_id,
            application_id,
            input_payload: json!({}),
            document_snapshot: Some(data_model_flow_document(flow_id, nodes, edges)),
            debug_session_id: None,
        })
        .await
        .expect("data model debug run should start");

    service
        .continue_flow_debug_run(ContinueFlowDebugRunCommand {
            application_id,
            flow_run_id: started.flow_run.id,
            workspace_id: Uuid::nil(),
        })
        .await
        .expect("data model debug run should return persisted detail")
}

trait RuntimeRepositoryBounds:
    ApplicationRepository
    + FlowRepository
    + OrchestrationRuntimeRepository
    + ModelDefinitionRepository
    + ModelProviderRepository
    + NodeContributionRepository
    + PluginRepository
    + Clone
    + Send
    + Sync
    + 'static
{
}

impl<T> RuntimeRepositoryBounds for T where
    T: ApplicationRepository
        + FlowRepository
        + OrchestrationRuntimeRepository
        + ModelDefinitionRepository
        + ModelProviderRepository
        + NodeContributionRepository
        + PluginRepository
        + Clone
        + Send
        + Sync
        + 'static
{
}

trait RuntimeHostBounds: ProviderRuntimePort + CapabilityPluginRuntimePort + Clone {}

impl<T> RuntimeHostBounds for T where T: ProviderRuntimePort + CapabilityPluginRuntimePort + Clone {}

fn node_run<'a>(
    detail: &'a domain::ApplicationRunDetail,
    node_id: &str,
) -> &'a domain::NodeRunRecord {
    detail
        .node_runs
        .iter()
        .find(|node_run| node_run.node_id == node_id)
        .unwrap_or_else(|| panic!("node run {node_id} should exist"))
}

fn data_model_flow_document(
    flow_id: Uuid,
    data_model_nodes: Vec<Value>,
    edges: Vec<(&str, &str)>,
) -> Value {
    let mut nodes = vec![json!({
        "id": "node-start",
        "type": "start",
        "alias": "Start",
        "description": "",
        "containerId": null,
        "position": { "x": 0, "y": 0 },
        "configVersion": 1,
        "config": {},
        "bindings": {},
        "outputs": []
    })];
    nodes.extend(data_model_nodes);

    json!({
        "schemaVersion": "1flowbase.flow/v2",
        "meta": {
            "flowId": flow_id.to_string(),
            "name": "Data Model Agent",
            "description": "",
            "tags": []
        },
        "graph": {
            "nodes": nodes,
            "edges": edges.into_iter().enumerate().map(|(index, (source, target))| {
                json!({
                    "id": format!("edge-{index}"),
                    "source": source,
                    "target": target,
                    "sourceHandle": null,
                    "targetHandle": null,
                    "containerId": null,
                    "points": []
                })
            }).collect::<Vec<_>>()
        },
        "editor": {
            "viewport": { "x": 0, "y": 0, "zoom": 1 },
            "annotations": [],
            "activeContainerPath": []
        }
    })
}

fn data_model_node(id: &str, action: &str, config_patch: Value, bindings: Value) -> Value {
    let mut config = serde_json::Map::from_iter([("data_model_code".to_string(), json!("orders"))]);
    if matches!(action, "create" | "update" | "delete") {
        config.insert(
            "side_effect_policy".to_string(),
            json!("allow_with_idempotency"),
        );
    }
    if let Some(patch) = config_patch.as_object() {
        config.extend(patch.clone());
    }

    json!({
        "id": id,
        "type": data_model_node_type(action),
        "alias": format!("Data Model {}", action),
        "description": "",
        "containerId": null,
        "position": { "x": 240, "y": 0 },
        "configVersion": 1,
        "config": Value::Object(config),
        "bindings": bindings,
        "outputs": [{ "key": "record", "title": "Record", "valueType": "object" }]
    })
}

fn data_model_node_type(action: &str) -> &'static str {
    match action {
        "list" => "data_model_list",
        "get" => "data_model_get",
        "create" => "data_model_create",
        "update" => "data_model_update",
        "delete" => "data_model_delete",
        _ => panic!("unsupported data model action in test: {action}"),
    }
}

fn selector_binding<const N: usize>(path: [&str; N]) -> Value {
    let path = path.into_iter().collect::<Vec<_>>();

    json!({
        "kind": "selector",
        "value": path
    })
}
