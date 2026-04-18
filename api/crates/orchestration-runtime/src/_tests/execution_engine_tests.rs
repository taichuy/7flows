use std::collections::BTreeMap;

use anyhow::Result;
use async_trait::async_trait;
use plugin_framework::provider_contract::{
    ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult, ProviderRuntimeError,
    ProviderRuntimeErrorKind, ProviderStreamEvent, ProviderUsage,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    compiled_plan::{
        CompiledBinding, CompiledLlmRuntime, CompiledNode, CompiledOutput, CompiledPlan,
    },
    execution_engine::{
        resume_flow_debug_run, start_flow_debug_run, ProviderInvocationOutput, ProviderInvoker,
    },
    execution_state::ExecutionStopReason,
};

struct StubProviderInvoker {
    fail: bool,
}

#[async_trait]
impl ProviderInvoker for StubProviderInvoker {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        if self.fail {
            return Ok(ProviderInvocationOutput {
                events: vec![ProviderStreamEvent::Error {
                    error: ProviderRuntimeError {
                        kind: ProviderRuntimeErrorKind::AuthFailed,
                        message: "invalid api_key".to_string(),
                        provider_summary: Some("Authorization: Bearer sk-secret-value".to_string()),
                    },
                }],
                result: ProviderInvocationResult {
                    finish_reason: Some(ProviderFinishReason::Error),
                    ..ProviderInvocationResult::default()
                },
            });
        }

        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: format!("echo:{}", runtime.model),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: ProviderUsage {
                        input_tokens: Some(5),
                        output_tokens: Some(7),
                        total_tokens: Some(12),
                        ..ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Stop,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some(format!("echo:{}", runtime.model)),
                usage: ProviderUsage {
                    input_tokens: Some(5),
                    output_tokens: Some(7),
                    total_tokens: Some(12),
                    ..ProviderUsage::default()
                },
                finish_reason: Some(ProviderFinishReason::Stop),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

fn base_plan() -> CompiledPlan {
    let mut nodes = BTreeMap::new();
    nodes.insert(
        "node-start".to_string(),
        CompiledNode {
            node_id: "node-start".to_string(),
            node_type: "start".to_string(),
            alias: "Start".to_string(),
            container_id: None,
            dependency_node_ids: vec![],
            downstream_node_ids: vec!["node-llm".to_string()],
            bindings: BTreeMap::new(),
            outputs: vec![CompiledOutput {
                key: "query".to_string(),
                title: "用户输入".to_string(),
                value_type: "string".to_string(),
            }],
            config: json!({}),
            llm_runtime: None,
        },
    );
    nodes.insert(
        "node-llm".to_string(),
        CompiledNode {
            node_id: "node-llm".to_string(),
            node_type: "llm".to_string(),
            alias: "LLM".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-start".to_string()],
            downstream_node_ids: vec!["node-human".to_string()],
            bindings: BTreeMap::from([(
                "user_prompt".to_string(),
                CompiledBinding {
                    kind: "selector".to_string(),
                    selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
                    raw_value: json!(["node-start", "query"]),
                },
            )]),
            outputs: vec![CompiledOutput {
                key: "text".to_string(),
                title: "模型输出".to_string(),
                value_type: "string".to_string(),
            }],
            config: json!({
                "provider_instance_id": "provider-ready",
                "model": "gpt-5.4-mini"
            }),
            llm_runtime: Some(CompiledLlmRuntime {
                provider_instance_id: "provider-ready".to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
            }),
        },
    );
    nodes.insert(
        "node-human".to_string(),
        CompiledNode {
            node_id: "node-human".to_string(),
            node_type: "human_input".to_string(),
            alias: "Human Input".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-llm".to_string()],
            downstream_node_ids: vec!["node-answer".to_string()],
            bindings: BTreeMap::from([(
                "prompt".to_string(),
                CompiledBinding {
                    kind: "templated_text".to_string(),
                    selector_paths: vec![vec!["node-llm".to_string(), "text".to_string()]],
                    raw_value: json!("请审核：{{ node-llm.text }}"),
                },
            )]),
            outputs: vec![CompiledOutput {
                key: "input".to_string(),
                title: "人工输入".to_string(),
                value_type: "string".to_string(),
            }],
            config: json!({}),
            llm_runtime: None,
        },
    );
    nodes.insert(
        "node-answer".to_string(),
        CompiledNode {
            node_id: "node-answer".to_string(),
            node_type: "answer".to_string(),
            alias: "Answer".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-human".to_string()],
            downstream_node_ids: vec![],
            bindings: BTreeMap::from([(
                "answer_template".to_string(),
                CompiledBinding {
                    kind: "selector".to_string(),
                    selector_paths: vec![vec!["node-human".to_string(), "input".to_string()]],
                    raw_value: json!(["node-human", "input"]),
                },
            )]),
            outputs: vec![CompiledOutput {
                key: "answer".to_string(),
                title: "对话输出".to_string(),
                value_type: "string".to_string(),
            }],
            config: json!({}),
            llm_runtime: None,
        },
    );

    CompiledPlan {
        flow_id: Uuid::nil(),
        source_draft_id: "draft-1".to_string(),
        schema_version: "1flowbase.flow/v1".to_string(),
        topological_order: vec![
            "node-start".to_string(),
            "node-llm".to_string(),
            "node-human".to_string(),
            "node-answer".to_string(),
        ],
        nodes,
        compile_issues: Vec::new(),
    }
}

#[tokio::test]
async fn start_flow_debug_run_waits_for_human_input() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": { "query": "请总结退款政策" }
        }),
        &StubProviderInvoker { fail: false },
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::WaitingHuman(ref wait) => {
            assert_eq!(wait.node_id, "node-human");
            assert!(wait.prompt.contains("请审核"));
        }
        other => panic!("expected waiting_human, got {other:?}"),
    }

    assert_eq!(outcome.node_traces.len(), 3);
    assert_eq!(outcome.node_traces[1].node_id, "node-llm");
    assert_eq!(
        outcome.node_traces[1].output_payload["text"],
        "echo:gpt-5.4-mini"
    );
    assert_eq!(outcome.node_traces[1].provider_events.len(), 3);
}

#[tokio::test]
async fn resume_flow_debug_run_completes_answer_after_human_input() {
    let waiting = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
        &StubProviderInvoker { fail: false },
    )
    .await
    .unwrap();

    let checkpoint = waiting.checkpoint_snapshot.clone().unwrap();
    let resumed = resume_flow_debug_run(
        &base_plan(),
        &checkpoint,
        &json!({ "node-human": { "input": "已审核，可继续" } }),
        &StubProviderInvoker { fail: false },
    )
    .await
    .unwrap();

    assert!(matches!(
        resumed.stop_reason,
        ExecutionStopReason::Completed
    ));
    assert_eq!(
        resumed.variable_pool["node-answer"]["answer"],
        json!("已审核，可继续")
    );
}

#[tokio::test]
async fn tool_node_emits_waiting_callback_stop_reason() {
    let mut plan = base_plan();
    plan.topological_order = vec!["node-start".to_string(), "node-tool".to_string()];
    plan.nodes.remove("node-llm");
    plan.nodes.remove("node-human");
    plan.nodes.remove("node-answer");
    plan.nodes.insert(
        "node-tool".to_string(),
        CompiledNode {
            node_id: "node-tool".to_string(),
            node_type: "tool".to_string(),
            alias: "Tool".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-start".to_string()],
            downstream_node_ids: vec![],
            bindings: BTreeMap::new(),
            outputs: vec![CompiledOutput {
                key: "result".to_string(),
                title: "工具输出".to_string(),
                value_type: "json".to_string(),
            }],
            config: json!({ "tool_name": "lookup_order" }),
            llm_runtime: None,
        },
    );

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "order_123" } }),
        &StubProviderInvoker { fail: false },
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::WaitingCallback(ref pending) => {
            assert_eq!(pending.node_id, "node-tool");
            assert_eq!(pending.callback_kind, "tool");
        }
        other => panic!("expected waiting_callback, got {other:?}"),
    }
}

#[tokio::test]
async fn provider_error_marks_flow_failed_and_redacts_summary() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
        &StubProviderInvoker { fail: true },
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::Failed(ref failure) => {
            assert_eq!(failure.node_id, "node-llm");
            assert_eq!(failure.error_payload["error_kind"], json!("auth_failed"));
            assert!(failure.error_payload["provider_summary"]
                .as_str()
                .unwrap()
                .contains("[REDACTED]"));
        }
        other => panic!("expected failed stop reason, got {other:?}"),
    }
}
