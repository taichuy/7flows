use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use async_trait::async_trait;
use plugin_framework::provider_contract::{
    ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult, ProviderStreamEvent,
    ProviderUsage,
};
use serde_json::json;
use uuid::Uuid;

use crate::{
    compiled_plan::{
        CodeIsolationProfile, CompiledBinding, CompiledCodeRuntime, CompiledLlmRuntime,
        CompiledNode, CompiledOutput, CompiledPlan,
    },
    execution_engine::{
        CodeInvocationOutput, CodeInvoker, ProviderInvocationOutput, ProviderInvoker,
    },
    preview_executor,
};

struct StubPreviewInvoker {
    captured_input: Arc<Mutex<Option<ProviderInvocationInput>>>,
}

#[async_trait]
impl ProviderInvoker for StubPreviewInvoker {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        *self
            .captured_input
            .lock()
            .expect("captured input mutex poisoned") = Some(input);
        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: format!("preview:{}", runtime.model),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: ProviderUsage {
                        input_tokens: Some(2),
                        output_tokens: Some(3),
                        total_tokens: Some(5),
                        ..ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Stop,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some(format!("preview:{}", runtime.model)),
                finish_reason: Some(ProviderFinishReason::Stop),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CodeInvoker for StubPreviewInvoker {
    async fn invoke_code_node(
        &self,
        _runtime: &CompiledCodeRuntime,
        _config_payload: serde_json::Value,
        input_payload: serde_json::Value,
    ) -> Result<CodeInvocationOutput> {
        Ok(CodeInvocationOutput {
            output_payload: json!({ "result": input_payload["query"] }),
        })
    }
}

fn sample_compiled_plan() -> CompiledPlan {
    let flow_id = Uuid::now_v7();
    let mut bindings = BTreeMap::new();
    bindings.insert(
        "prompt_messages".to_string(),
        CompiledBinding {
            kind: "prompt_messages".to_string(),
            raw_value: json!([
                {
                    "id": "system-1",
                    "role": "system",
                    "content": {
                        "kind": "templated_text",
                        "value": "You are helpful."
                    }
                },
                {
                    "id": "user-1",
                    "role": "user",
                    "content": {
                        "kind": "templated_text",
                        "value": "{{node-start.query}}"
                    }
                }
            ]),
            selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
        },
    );

    let mut nodes = BTreeMap::new();
    nodes.insert(
        "node-start".to_string(),
        CompiledNode {
            node_id: "node-start".to_string(),
            node_type: "start".to_string(),
            alias: "Start".to_string(),
            container_id: None,
            dependency_node_ids: Vec::new(),
            downstream_node_ids: vec!["node-llm".to_string()],
            bindings: BTreeMap::new(),
            outputs: Vec::new(),
            config: json!({}),
            plugin_runtime: None,
            llm_runtime: None,
            code_runtime: None,
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
            downstream_node_ids: Vec::new(),
            bindings,
            outputs: vec![CompiledOutput {
                key: "text".to_string(),
                title: "模型输出".to_string(),
                value_type: "string".to_string(),
                selector: Vec::new(),
            }],
            config: json!({
                "provider_instance_id": "provider-ready",
                "model": "gpt-5.4-mini"
            }),
            plugin_runtime: None,
            llm_runtime: Some(CompiledLlmRuntime {
                provider_instance_id: "provider-ready".to_string(),
                provider_code: "fixture_provider".to_string(),
                protocol: "openai_compatible".to_string(),
                model: "gpt-5.4-mini".to_string(),
                routing: None,
            }),
            code_runtime: None,
        },
    );

    CompiledPlan {
        flow_id,
        source_draft_id: "draft-1".to_string(),
        schema_version: "1flowbase.flow/v2".to_string(),
        topological_order: vec!["node-start".to_string(), "node-llm".to_string()],
        nodes,
        compile_issues: Vec::new(),
    }
}

#[tokio::test]
async fn preview_executor_uses_start_input_as_start_output() {
    let plan = sample_compiled_plan();
    let invoker = StubPreviewInvoker {
        captured_input: Arc::new(Mutex::new(None)),
    };
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-start",
        &serde_json::json!({
            "node-start": {
                "query": "退款流程是什么？",
                "files": [{ "filename": "policy.pdf" }]
            }
        }),
        &invoker,
    )
    .await
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-start");
    assert_eq!(outcome.resolved_inputs["query"], "退款流程是什么？");
    assert_eq!(outcome.node_output["query"], "退款流程是什么？");
    assert_eq!(outcome.node_output["model"], "");
    assert_eq!(outcome.node_output["history"], json!([]));
    assert_eq!(outcome.node_output["files"][0]["filename"], "policy.pdf");
    assert!(outcome.provider_events.is_empty());
}

#[tokio::test]
async fn preview_executor_resolves_bindings_renders_prompt_and_calls_provider() {
    let plan = sample_compiled_plan();
    let invoker = StubPreviewInvoker {
        captured_input: Arc::new(Mutex::new(None)),
    };
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
        &invoker,
    )
    .await
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert_eq!(
        outcome.resolved_inputs["prompt_messages"][1]["content"],
        "退款流程是什么？"
    );
    assert_eq!(
        outcome.rendered_templates["prompt_messages"][0]["content"],
        "You are helpful."
    );
    assert_eq!(outcome.node_output["text"], "preview:gpt-5.4-mini");
    assert_eq!(outcome.provider_events.len(), 3);
    assert!(!outcome.is_failed());

    let captured_input = invoker
        .captured_input
        .lock()
        .expect("captured input mutex poisoned")
        .clone()
        .expect("provider input should be captured");
    assert!(captured_input.model_parameters.is_empty());
    assert_eq!(captured_input.response_format, None);
}

#[tokio::test]
async fn preview_executor_code_node_executes_runner() {
    let mut plan = sample_compiled_plan();
    if let Some(node) = plan.nodes.get_mut("node-llm") {
        node.node_type = "code".to_string();
        node.bindings = BTreeMap::from([(
            "query".to_string(),
            CompiledBinding {
                kind: "selector".to_string(),
                raw_value: json!({ "kind": "selector", "value": ["node-start", "query"] }),
                selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
            },
        )]);
        node.outputs = vec![CompiledOutput {
            key: "result".to_string(),
            title: "Result".to_string(),
            value_type: "string".to_string(),
            selector: Vec::new(),
        }];
        node.code_runtime = Some(CompiledCodeRuntime {
            language: "javascript".to_string(),
            source: Some("function main(inputs) { return { result: inputs.query }; }".to_string()),
            source_ref: None,
            entrypoint: "main".to_string(),
            imports: Vec::new(),
            dependencies: Vec::new(),
            isolation_profile: CodeIsolationProfile::quickjs_default(),
        });
    }

    let invoker = StubPreviewInvoker {
        captured_input: Arc::new(Mutex::new(None)),
    };
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
        &invoker,
    )
    .await
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert!(!outcome.is_failed());
    assert_eq!(
        outcome.node_output,
        serde_json::json!({ "result": "退款流程是什么？" })
    );
    assert_eq!(outcome.metrics_payload["language"], "javascript");
    assert_eq!(outcome.metrics_payload["entrypoint"], "main");
    assert_eq!(outcome.metrics_payload["error"], false);
    assert!(outcome.provider_events.is_empty());
}

#[tokio::test]
async fn preview_executor_unsupported_node_type_not_implemented_returns_error() {
    let mut plan = sample_compiled_plan();
    if let Some(node) = plan.nodes.get_mut("node-llm") {
        node.node_type = "x_unknown".to_string();
    }

    let invoker = StubPreviewInvoker {
        captured_input: Arc::new(Mutex::new(None)),
    };
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
        &invoker,
    )
    .await
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert!(outcome.is_failed());
    let error_payload = outcome
        .error_payload
        .expect("unsupported node should return preview error payload");
    assert_eq!(error_payload["error_code"], "node_type_not_implemented");
    assert_eq!(error_payload["node_type"], "x_unknown");
    assert_eq!(
        error_payload["message"],
        "x_unknown nodes are not implemented in preview runtime"
    );
    assert_eq!(outcome.metrics_payload["preview_mode"], true);
    assert_eq!(outcome.node_output, serde_json::json!({}));
    assert!(outcome.provider_events.is_empty());
}
