use std::collections::BTreeMap;

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
        CompiledBinding, CompiledLlmRuntime, CompiledNode, CompiledOutput, CompiledPlan,
    },
    execution_engine::{ProviderInvocationOutput, ProviderInvoker},
    preview_executor,
};

struct StubPreviewInvoker;

#[async_trait]
impl ProviderInvoker for StubPreviewInvoker {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
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

fn sample_compiled_plan() -> CompiledPlan {
    let flow_id = Uuid::now_v7();
    let mut bindings = BTreeMap::new();
    bindings.insert(
        "user_prompt".to_string(),
        CompiledBinding {
            kind: "selector".to_string(),
            raw_value: json!(["node-start", "query"]),
            selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
        },
    );
    bindings.insert(
        "system_prompt".to_string(),
        CompiledBinding {
            kind: "templated_text".to_string(),
            raw_value: json!("You are helpful."),
            selector_paths: Vec::new(),
        },
    );

    let mut nodes = BTreeMap::new();
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

    CompiledPlan {
        flow_id,
        source_draft_id: "draft-1".to_string(),
        schema_version: "1flowbase.flow/v1".to_string(),
        topological_order: vec!["node-start".to_string(), "node-llm".to_string()],
        nodes,
        compile_issues: Vec::new(),
    }
}

#[tokio::test]
async fn preview_executor_resolves_bindings_renders_prompt_and_calls_provider() {
    let plan = sample_compiled_plan();
    let outcome = preview_executor::run_node_preview(
        &plan,
        "node-llm",
        &serde_json::json!({ "node-start": { "query": "退款流程是什么？" } }),
        &StubPreviewInvoker,
    )
    .await
    .unwrap();

    assert_eq!(outcome.target_node_id, "node-llm");
    assert_eq!(outcome.resolved_inputs["user_prompt"], "退款流程是什么？");
    assert_eq!(
        outcome.rendered_templates["system_prompt"],
        "You are helpful."
    );
    assert_eq!(outcome.node_output["text"], "preview:gpt-5.4-mini");
    assert_eq!(outcome.provider_events.len(), 3);
    assert!(!outcome.is_failed());
}
