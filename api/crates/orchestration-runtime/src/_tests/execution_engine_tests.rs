use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use anyhow::Result;
use async_trait::async_trait;
use plugin_framework::{
    error::PluginFrameworkError,
    provider_contract::{
        ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult, ProviderMcpCall,
        ProviderMessageRole, ProviderRuntimeError, ProviderRuntimeErrorKind, ProviderStreamEvent,
        ProviderToolCall, ProviderUsage,
    },
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    compiled_plan::{
        CompiledBinding, CompiledLlmRouteTarget, CompiledLlmRouting, CompiledLlmRuntime,
        CompiledNode, CompiledOutput, CompiledPlan, CompiledPluginRuntime, LlmRoutingMode,
    },
    execution_engine::{
        resume_flow_debug_run, start_flow_debug_run, CapabilityInvocationOutput, CapabilityInvoker,
        ProviderInvocationOutput, ProviderInvoker,
    },
    execution_state::ExecutionStopReason,
};

struct StubProviderInvoker {
    fail: bool,
    captured_input: Arc<Mutex<Option<ProviderInvocationInput>>>,
    final_content: String,
}

#[async_trait]
impl ProviderInvoker for StubProviderInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        *self
            .captured_input
            .lock()
            .expect("captured input mutex poisoned") = Some(input);

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
                    delta: self.final_content.clone(),
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
                final_content: Some(self.final_content.clone()),
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

#[async_trait]
impl CapabilityInvoker for StubProviderInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        Ok(CapabilityInvocationOutput {
            output_payload: json!({
                "answer": input_payload["query"].clone(),
            }),
        })
    }
}

struct UnknownCapabilityOutputInvoker;
struct ReservedCapabilityOutputInvoker;

#[async_trait]
impl ProviderInvoker for UnknownCapabilityOutputInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        unreachable!("plugin output contract test does not execute llm nodes")
    }
}

#[async_trait]
impl CapabilityInvoker for UnknownCapabilityOutputInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: Value,
        _input_payload: Value,
    ) -> Result<CapabilityInvocationOutput> {
        Ok(CapabilityInvocationOutput {
            output_payload: json!({
                "answer": "ok",
                "unexpected": true
            }),
        })
    }
}

#[async_trait]
impl ProviderInvoker for ReservedCapabilityOutputInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        unreachable!("plugin output contract test does not execute llm nodes")
    }
}

#[async_trait]
impl CapabilityInvoker for ReservedCapabilityOutputInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: Value,
        _input_payload: Value,
    ) -> Result<CapabilityInvocationOutput> {
        Ok(CapabilityInvocationOutput {
            output_payload: json!({
                "answer": "ok",
                "metadata": { "secret": "x" }
            }),
        })
    }
}

struct RuntimeContractErrorInvoker;

#[async_trait]
impl ProviderInvoker for RuntimeContractErrorInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        Err(PluginFrameworkError::runtime(ProviderRuntimeError {
            kind: ProviderRuntimeErrorKind::ProviderInvalidResponse,
            message: "401 401 Unauthorized: Incorrect API key provided".to_string(),
            provider_summary: None,
        })
        .into())
    }
}

#[async_trait]
impl CapabilityInvoker for RuntimeContractErrorInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("base plan does not execute capability nodes")
    }
}

struct FailsAfterFirstTokenInvoker;

#[async_trait]
impl ProviderInvoker for FailsAfterFirstTokenInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: "partial answer".to_string(),
                },
                ProviderStreamEvent::Error {
                    error: ProviderRuntimeError {
                        kind: ProviderRuntimeErrorKind::ProviderInvalidResponse,
                        message: "stream failed".to_string(),
                        provider_summary: None,
                    },
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some("partial answer".to_string()),
                finish_reason: Some(ProviderFinishReason::Error),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for FailsAfterFirstTokenInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("base plan does not execute capability nodes")
    }
}

struct InputCacheUsageSnapshotInvoker;

#[async_trait]
impl ProviderInvoker for InputCacheUsageSnapshotInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: "cache-aware response".to_string(),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: ProviderUsage {
                        input_tokens: Some(100),
                        input_cache_hit_tokens: Some(40),
                        input_cache_miss_tokens: Some(60),
                        output_tokens: Some(12),
                        total_tokens: Some(112),
                        ..ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Stop,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some("cache-aware response".to_string()),
                finish_reason: Some(ProviderFinishReason::Stop),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for InputCacheUsageSnapshotInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("base plan does not execute capability nodes")
    }
}

struct ToolMcpMetadataInvoker;

#[async_trait]
impl ProviderInvoker for ToolMcpMetadataInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: "tool-aware response".to_string(),
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::ToolCall,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some("tool-aware response".to_string()),
                tool_calls: vec![ProviderToolCall {
                    id: "tool-call-1".to_string(),
                    name: "lookup_order".to_string(),
                    arguments: json!({ "order_id": "order_123" }),
                }],
                mcp_calls: vec![ProviderMcpCall {
                    id: "mcp-call-1".to_string(),
                    server: "orders".to_string(),
                    method: "get_order".to_string(),
                    arguments: json!({ "id": "order_123" }),
                }],
                finish_reason: Some(ProviderFinishReason::ToolCall),
                provider_metadata: json!({ "raw_id": "provider-response-1" }),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for ToolMcpMetadataInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("base plan does not execute capability nodes")
    }
}

struct FailFirstFailoverInvoker {
    calls: Arc<Mutex<Vec<String>>>,
}

#[async_trait]
impl ProviderInvoker for FailFirstFailoverInvoker {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        self.calls
            .lock()
            .expect("calls mutex poisoned")
            .push(runtime.provider_instance_id.clone());
        if runtime.provider_instance_id == "provider-primary" {
            anyhow::bail!("primary provider unavailable");
        }

        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: format!("winner:{}", runtime.model),
                },
                ProviderStreamEvent::UsageSnapshot {
                    usage: ProviderUsage {
                        input_tokens: Some(3),
                        output_tokens: Some(4),
                        total_tokens: Some(7),
                        ..ProviderUsage::default()
                    },
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Stop,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some(format!("winner:{}", runtime.model)),
                usage: ProviderUsage {
                    input_tokens: Some(3),
                    output_tokens: Some(4),
                    total_tokens: Some(7),
                    ..ProviderUsage::default()
                },
                finish_reason: Some(ProviderFinishReason::Stop),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for FailFirstFailoverInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("failover plan does not execute capability nodes")
    }
}

struct FailAfterTokenFinishErrorFailoverInvoker {
    calls: Arc<Mutex<Vec<String>>>,
}

#[async_trait]
impl ProviderInvoker for FailAfterTokenFinishErrorFailoverInvoker {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        self.calls
            .lock()
            .expect("calls mutex poisoned")
            .push(runtime.provider_instance_id.clone());

        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::TextDelta {
                    delta: "partial answer".to_string(),
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Error,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some("partial answer".to_string()),
                finish_reason: Some(ProviderFinishReason::Error),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for FailAfterTokenFinishErrorFailoverInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("failover plan does not execute capability nodes")
    }
}

fn successful_invoker() -> StubProviderInvoker {
    StubProviderInvoker {
        fail: false,
        captured_input: Arc::new(Mutex::new(None)),
        final_content: "echo:gpt-5.4-mini".to_string(),
    }
}

async fn run_llm_trace_with_fixture_provider() -> crate::execution_state::NodeExecutionTrace {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": {
                "query": "hello"
            }
        }),
        &successful_invoker(),
    )
    .await
    .unwrap();

    outcome
        .node_traces
        .into_iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist")
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
                selector: Vec::new(),
            }],
            config: json!({}),
            plugin_runtime: None,
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
                "prompt_messages".to_string(),
                CompiledBinding {
                    kind: "prompt_messages".to_string(),
                    selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
                    raw_value: json!([
                        {
                            "id": "user-1",
                            "role": "user",
                            "content": {
                                "kind": "templated_text",
                                "value": "{{node-start.query}}"
                            }
                        }
                    ]),
                },
            )]),
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
                selector: Vec::new(),
            }],
            config: json!({}),
            plugin_runtime: None,
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
                selector: Vec::new(),
            }],
            config: json!({}),
            plugin_runtime: None,
            llm_runtime: None,
        },
    );

    CompiledPlan {
        flow_id: Uuid::nil(),
        source_draft_id: "draft-1".to_string(),
        schema_version: "1flowbase.flow/v2".to_string(),
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
async fn llm_node_success_keeps_processed_result_fields_in_output_payload() {
    let trace = run_llm_trace_with_fixture_provider().await;

    assert_eq!(trace.output_payload["text"], json!("echo:gpt-5.4-mini"));
    assert_eq!(
        trace.output_payload["provider_route"]["provider_instance_id"],
        "provider-ready"
    );
    assert_eq!(
        trace.output_payload["provider_route"]["provider_code"],
        "fixture_provider"
    );
    assert_eq!(
        trace.output_payload["provider_route"]["protocol"],
        "openai_compatible"
    );
    assert_eq!(
        trace.output_payload["provider_route"]["model"],
        "gpt-5.4-mini"
    );
    assert_eq!(trace.output_payload["finish_reason"], json!("stop"));
    assert_eq!(trace.output_payload["usage"]["input_tokens"], json!(5));
    assert_eq!(trace.output_payload["usage"]["output_tokens"], json!(7));
    assert_eq!(trace.output_payload["usage"]["total_tokens"], json!(12));
    assert!(trace.output_payload.get("route").is_none());
    assert!(trace.output_payload.get("attempts").is_none());
    assert!(trace.output_payload.get("assistant_message").is_none());
    assert!(trace.output_payload.get("raw_response_ref").is_none());
    assert!(trace.output_payload.get("context_projection_ref").is_none());
    assert!(trace.output_payload.get("attempt_refs").is_none());
    assert!(trace.output_payload.get("winner_attempt_ref").is_none());
    assert_eq!(
        trace.debug_payload["provider_events"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert!(trace.output_payload.get("provider_events").is_none());
}

#[tokio::test]
async fn llm_node_final_usage_preserves_input_cache_snapshot_fields_in_metrics_payload() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": {
                "query": "hello"
            }
        }),
        &InputCacheUsageSnapshotInvoker,
    )
    .await
    .unwrap();
    let trace = outcome
        .node_traces
        .into_iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");

    assert_eq!(trace.output_payload["text"], json!("cache-aware response"));
    assert_eq!(
        trace.output_payload["usage"],
        trace.metrics_payload["usage"]
    );
    assert_eq!(trace.metrics_payload["usage"]["input_tokens"], json!(100));
    assert_eq!(
        trace.metrics_payload["usage"]["input_cache_hit_tokens"],
        json!(40)
    );
    assert_eq!(
        trace.metrics_payload["usage"]["input_cache_miss_tokens"],
        json!(60)
    );
    assert_eq!(trace.metrics_payload["usage"]["output_tokens"], json!(12));
    assert_eq!(trace.metrics_payload["usage"]["total_tokens"], json!(112));
    assert_eq!(
        trace.metrics_payload["usage"]["cache_write_tokens"],
        Value::Null
    );
}

#[tokio::test]
async fn llm_output_payload_keeps_think_tags_in_standard_text_content() {
    let invoker = StubProviderInvoker {
        fail: false,
        captured_input: Arc::new(Mutex::new(None)),
        final_content: "<think>先分析用户问题</think>正式回答".to_string(),
    };
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": {
                "query": "hello"
            }
        }),
        &invoker,
    )
    .await
    .unwrap();
    let trace = outcome
        .node_traces
        .into_iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");

    assert_eq!(
        trace.output_payload["text"],
        json!("<think>先分析用户问题</think>正式回答")
    );
    assert!(trace.output_payload.get("reasoning_content").is_none());
    assert!(trace.debug_payload.get("reasoning_content").is_none());
    assert!(trace.output_payload.get("message").is_none());
}

struct ReasoningDeltaProviderInvoker;

#[async_trait]
impl ProviderInvoker for ReasoningDeltaProviderInvoker {
    async fn invoke_llm(
        &self,
        _runtime: &CompiledLlmRuntime,
        _input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput> {
        Ok(ProviderInvocationOutput {
            events: vec![
                ProviderStreamEvent::ReasoningDelta {
                    delta: "先分析".to_string(),
                },
                ProviderStreamEvent::TextDelta {
                    delta: "正式回答".to_string(),
                },
                ProviderStreamEvent::Finish {
                    reason: ProviderFinishReason::Stop,
                },
            ],
            result: ProviderInvocationResult {
                final_content: Some("正式回答".to_string()),
                finish_reason: Some(ProviderFinishReason::Stop),
                ..ProviderInvocationResult::default()
            },
        })
    }
}

#[async_trait]
impl CapabilityInvoker for ReasoningDeltaProviderInvoker {
    async fn invoke_capability_node(
        &self,
        _runtime: &CompiledPluginRuntime,
        _config_payload: serde_json::Value,
        _input_payload: serde_json::Value,
    ) -> Result<CapabilityInvocationOutput> {
        unreachable!("base plan does not execute capability nodes")
    }
}

#[tokio::test]
async fn llm_output_payload_merges_reasoning_deltas_into_dify_style_text() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": {
                "query": "hello"
            }
        }),
        &ReasoningDeltaProviderInvoker,
    )
    .await
    .unwrap();
    let trace = outcome
        .node_traces
        .into_iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");

    assert_eq!(
        trace.output_payload["text"],
        json!("<think>先分析</think>正式回答")
    );
    assert!(trace.output_payload.get("reasoning_content").is_none());
    assert!(trace.debug_payload.get("reasoning_content").is_none());
    assert!(trace.output_payload.get("message").is_none());
}

#[tokio::test]
async fn llm_node_output_payload_keeps_provider_result_fields_out_of_debug_payload() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({
            "node-start": {
                "query": "hello"
            }
        }),
        &ToolMcpMetadataInvoker,
    )
    .await
    .unwrap();
    let trace = outcome
        .node_traces
        .into_iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");

    assert_eq!(trace.output_payload["text"], json!("tool-aware response"));
    assert_eq!(
        trace.output_payload["tool_calls"][0]["name"],
        "lookup_order"
    );
    assert_eq!(trace.output_payload["mcp_calls"][0]["method"], "get_order");
    assert_eq!(
        trace.output_payload["provider_metadata"]["raw_id"],
        "provider-response-1"
    );
    assert_eq!(
        trace.output_payload["provider_route"]["provider_code"],
        "fixture_provider"
    );
    assert_eq!(trace.output_payload["finish_reason"], json!("tool_call"));
    assert!(trace.debug_payload.get("provider_metadata").is_none());
    assert!(trace.debug_payload.get("provider_route").is_none());
}

#[tokio::test]
async fn llm_runtime_sends_rendered_prompt_messages_to_provider() {
    let mut plan = base_plan();
    let llm = plan
        .nodes
        .get_mut("node-llm")
        .expect("llm node should exist");
    llm.bindings = BTreeMap::from([(
        "prompt_messages".to_string(),
        CompiledBinding {
            kind: "prompt_messages".to_string(),
            selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
            raw_value: json!([
                {
                    "id": "system-1",
                    "role": "system",
                    "content": {
                        "kind": "templated_text",
                        "value": "You are concise."
                    }
                },
                {
                    "id": "user-1",
                    "role": "user",
                    "content": {
                        "kind": "templated_text",
                        "value": "Question: {{ node-start.query }}"
                    }
                },
                {
                    "id": "assistant-1",
                    "role": "assistant",
                    "content": {
                        "kind": "templated_text",
                        "value": "Prior answer."
                    }
                }
            ]),
        },
    )]);
    let captured_input = Arc::new(Mutex::new(None));
    let invoker = StubProviderInvoker {
        fail: false,
        captured_input: captured_input.clone(),
        final_content: "ok".to_string(),
    };

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "hello" } }),
        &invoker,
    )
    .await
    .unwrap();

    let input = captured_input
        .lock()
        .expect("captured input mutex poisoned")
        .clone()
        .expect("provider input should be captured");
    assert_eq!(input.system, Some("You are concise.".to_string()));
    assert_eq!(input.messages.len(), 2);
    assert_eq!(input.messages[0].role, ProviderMessageRole::User);
    assert_eq!(input.messages[0].content, "Question: hello");
    assert_eq!(input.messages[1].role, ProviderMessageRole::Assistant);
    assert_eq!(input.messages[1].content, "Prior answer.");

    let trace = outcome
        .node_traces
        .iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");
    assert_eq!(
        trace.input_payload["prompt_messages"][1]["content"],
        json!("Question: hello")
    );
}

#[tokio::test]
async fn failover_queue_retries_next_target_before_first_token() {
    let mut plan = base_plan();
    let llm = plan
        .nodes
        .get_mut("node-llm")
        .expect("llm node should exist");
    llm.llm_runtime = Some(CompiledLlmRuntime {
        provider_instance_id: "provider-primary".to_string(),
        provider_code: "fixture_provider".to_string(),
        protocol: "openai_compatible".to_string(),
        model: "primary-model".to_string(),
        routing: Some(CompiledLlmRouting {
            routing_mode: LlmRoutingMode::FailoverQueue,
            fixed_model_target: None,
            queue_template_id: Some("queue-template-1".to_string()),
            queue_snapshot_id: Some("queue-snapshot-1".to_string()),
            queue_targets: vec![
                CompiledLlmRouteTarget {
                    provider_instance_id: "provider-primary".to_string(),
                    provider_code: "fixture_provider".to_string(),
                    protocol: "openai_compatible".to_string(),
                    upstream_model_id: "primary-model".to_string(),
                },
                CompiledLlmRouteTarget {
                    provider_instance_id: "provider-backup".to_string(),
                    provider_code: "fixture_provider".to_string(),
                    protocol: "openai_compatible".to_string(),
                    upstream_model_id: "backup-model".to_string(),
                },
            ],
            context_policy: json!({}),
            stream_policy: json!({}),
        }),
    });
    let calls = Arc::new(Mutex::new(Vec::new()));
    let invoker = FailFirstFailoverInvoker {
        calls: calls.clone(),
    };

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "hello" } }),
        &invoker,
    )
    .await
    .unwrap();
    let llm_trace = outcome
        .node_traces
        .iter()
        .find(|trace| trace.node_id == "node-llm")
        .expect("llm trace should exist");

    assert_eq!(
        calls.lock().expect("calls mutex poisoned").as_slice(),
        ["provider-primary", "provider-backup"]
    );
    assert_eq!(
        llm_trace.output_payload["text"],
        json!("winner:backup-model")
    );
    assert_eq!(
        llm_trace.metrics_payload["attempts"][0]["status"],
        json!("failed")
    );
    assert_eq!(
        llm_trace.metrics_payload["attempts"][1]["status"],
        json!("succeeded")
    );
    assert_eq!(
        llm_trace.metrics_payload["queue_snapshot_id"],
        json!("queue-snapshot-1")
    );
}

#[tokio::test]
async fn failover_queue_stops_when_primary_fails_after_finish_error_with_first_token() {
    let mut plan = base_plan();
    let llm = plan
        .nodes
        .get_mut("node-llm")
        .expect("llm node should exist");
    llm.llm_runtime = Some(CompiledLlmRuntime {
        provider_instance_id: "provider-primary".to_string(),
        provider_code: "fixture_provider".to_string(),
        protocol: "openai_compatible".to_string(),
        model: "primary-model".to_string(),
        routing: Some(CompiledLlmRouting {
            routing_mode: LlmRoutingMode::FailoverQueue,
            fixed_model_target: None,
            queue_template_id: Some("queue-template-1".to_string()),
            queue_snapshot_id: Some("queue-snapshot-1".to_string()),
            queue_targets: vec![
                CompiledLlmRouteTarget {
                    provider_instance_id: "provider-primary".to_string(),
                    provider_code: "fixture_provider".to_string(),
                    protocol: "openai_compatible".to_string(),
                    upstream_model_id: "primary-model".to_string(),
                },
                CompiledLlmRouteTarget {
                    provider_instance_id: "provider-backup".to_string(),
                    provider_code: "fixture_provider".to_string(),
                    protocol: "openai_compatible".to_string(),
                    upstream_model_id: "backup-model".to_string(),
                },
            ],
            context_policy: json!({}),
            stream_policy: json!({}),
        }),
    });
    let calls = Arc::new(Mutex::new(Vec::new()));
    let invoker = FailAfterTokenFinishErrorFailoverInvoker {
        calls: calls.clone(),
    };

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "hello" } }),
        &invoker,
    )
    .await
    .unwrap();

    assert_eq!(
        calls.lock().expect("calls mutex poisoned").as_slice(),
        ["provider-primary"]
    );
    match outcome.stop_reason {
        ExecutionStopReason::Failed(ref failure) => {
            assert_eq!(failure.node_id, "node-llm");
            assert_eq!(
                outcome.node_traces[1].error_payload.as_ref().unwrap()["error_kind"],
                json!("provider_invalid_response")
            );
            assert!(outcome.node_traces[1].output_payload.get("text").is_none());
            assert!(outcome.variable_pool.get("node-llm").is_none());
            assert_eq!(
                outcome.node_traces[1].metrics_payload["attempts"][0]["failed_after_first_token"],
                json!(true)
            );
        }
        other => panic!("expected failed stop reason, got {other:?}"),
    }
}

fn plugin_plan() -> CompiledPlan {
    let mut nodes = BTreeMap::new();
    nodes.insert(
        "node-start".to_string(),
        CompiledNode {
            node_id: "node-start".to_string(),
            node_type: "start".to_string(),
            alias: "Start".to_string(),
            container_id: None,
            dependency_node_ids: vec![],
            downstream_node_ids: vec!["node-plugin".to_string()],
            bindings: BTreeMap::new(),
            outputs: vec![CompiledOutput {
                key: "query".to_string(),
                title: "用户输入".to_string(),
                value_type: "string".to_string(),
                selector: Vec::new(),
            }],
            config: json!({}),
            plugin_runtime: None,
            llm_runtime: None,
        },
    );
    nodes.insert(
        "node-plugin".to_string(),
        CompiledNode {
            node_id: "node-plugin".to_string(),
            node_type: "plugin_node".to_string(),
            alias: "Plugin Node".to_string(),
            container_id: None,
            dependency_node_ids: vec!["node-start".to_string()],
            downstream_node_ids: vec![],
            bindings: BTreeMap::from([(
                "query".to_string(),
                CompiledBinding {
                    kind: "selector".to_string(),
                    selector_paths: vec![vec!["node-start".to_string(), "query".to_string()]],
                    raw_value: json!(["node-start", "query"]),
                },
            )]),
            outputs: vec![CompiledOutput {
                key: "answer".to_string(),
                title: "回答".to_string(),
                value_type: "string".to_string(),
                selector: Vec::new(),
            }],
            config: json!({
                "prompt": "Hello {{ node-start.query }}"
            }),
            plugin_runtime: Some(CompiledPluginRuntime {
                installation_id: Uuid::nil(),
                plugin_unique_identifier: "fixture_capability".to_string(),
                package_id: "fixture_capability@0.1.0".to_string(),
                plugin_id: "fixture_capability@0.1.0".to_string(),
                plugin_version: "0.1.0".to_string(),
                contribution_code: "fixture_action".to_string(),
                node_shell: "action".to_string(),
                schema_version: "1flowbase.node-contribution/v2".to_string(),
                contribution_checksum: "sha256:contribution".to_string(),
                compiled_contribution_hash: "sha256:compiled".to_string(),
                output_schema_snapshot: vec![CompiledOutput {
                    key: "answer".to_string(),
                    title: "回答".to_string(),
                    value_type: "string".to_string(),
                    selector: Vec::new(),
                }],
                side_effect_policy: "external_read".to_string(),
            }),
            llm_runtime: None,
        },
    );

    CompiledPlan {
        flow_id: Uuid::nil(),
        source_draft_id: "draft-plugin".to_string(),
        schema_version: "1flowbase.flow/v2".to_string(),
        topological_order: vec!["node-start".to_string(), "node-plugin".to_string()],
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
        &successful_invoker(),
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
        &successful_invoker(),
    )
    .await
    .unwrap();

    let checkpoint = waiting.checkpoint_snapshot.clone().unwrap();
    let resumed = resume_flow_debug_run(
        &base_plan(),
        &checkpoint,
        "node-human",
        &json!({ "input": "已审核，可继续" }),
        &successful_invoker(),
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
async fn resume_flow_debug_run_rejects_non_public_resume_output_keys() {
    let waiting = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
        &successful_invoker(),
    )
    .await
    .unwrap();

    let checkpoint = waiting.checkpoint_snapshot.clone().unwrap();
    let error = resume_flow_debug_run(
        &base_plan(),
        &checkpoint,
        "node-human",
        &json!({
            "input": "已审核，可继续",
            "node-llm": { "text": "polluted" }
        }),
        &successful_invoker(),
    )
    .await
    .unwrap_err();

    assert!(error
        .to_string()
        .contains("resume payload key node-llm is not a public output for node-human"));
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
                selector: Vec::new(),
            }],
            config: json!({ "tool_name": "lookup_order" }),
            plugin_runtime: None,
            llm_runtime: None,
        },
    );

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "order_123" } }),
        &successful_invoker(),
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
        &StubProviderInvoker {
            fail: true,
            captured_input: Arc::new(Mutex::new(None)),
            final_content: String::new(),
        },
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::Failed(ref failure) => {
            assert_eq!(failure.node_id, "node-llm");
            assert_eq!(failure.error_payload["error_kind"], json!("auth_failed"));
            assert_eq!(
                outcome.node_traces[1].error_payload.as_ref().unwrap()["error_kind"],
                json!("auth_failed")
            );
            assert!(outcome.node_traces[1].output_payload.get("text").is_none());
            assert!(outcome.variable_pool.get("node-llm").is_none());
            assert!(failure.error_payload["provider_summary"]
                .as_str()
                .unwrap()
                .contains("[REDACTED]"));
        }
        other => panic!("expected failed stop reason, got {other:?}"),
    }
}

#[tokio::test]
async fn provider_runtime_contract_error_is_renormalized_for_llm_output() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
        &RuntimeContractErrorInvoker,
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::Failed(ref failure) => {
            assert_eq!(failure.node_id, "node-llm");
            assert_eq!(failure.error_payload["error_kind"], json!("auth_failed"));
            assert_eq!(
                failure.error_payload["message"],
                json!("401 401 Unauthorized: Incorrect API key provided")
            );
            assert_eq!(
                outcome.node_traces[1].error_payload.as_ref().unwrap()["message"],
                json!("401 401 Unauthorized: Incorrect API key provided")
            );
            assert!(outcome.node_traces[1].output_payload.get("text").is_none());
            assert!(outcome.variable_pool.get("node-llm").is_none());
        }
        other => panic!("expected failed stop reason, got {other:?}"),
    }
}

#[tokio::test]
async fn llm_failure_after_first_token_does_not_write_public_output_to_variable_pool() {
    let outcome = start_flow_debug_run(
        &base_plan(),
        &json!({ "node-start": { "query": "退款政策" } }),
        &FailsAfterFirstTokenInvoker,
    )
    .await
    .unwrap();

    match outcome.stop_reason {
        ExecutionStopReason::Failed(ref failure) => {
            assert_eq!(failure.node_id, "node-llm");
            assert_eq!(
                failure.error_payload["error_kind"],
                json!("provider_invalid_response")
            );
            assert_eq!(
                outcome.node_traces[1].error_payload.as_ref().unwrap()["error_kind"],
                json!("provider_invalid_response")
            );
            assert!(outcome.node_traces[1].output_payload.get("text").is_none());
            assert!(outcome.variable_pool.get("node-llm").is_none());
            assert_eq!(
                outcome.node_traces[1].metrics_payload["attempts"][0]["failed_after_first_token"],
                json!(true)
            );
        }
        other => panic!("expected failed stop reason, got {other:?}"),
    }
}

#[tokio::test]
async fn llm_runtime_sends_enabled_model_parameters_and_keeps_undeclared_structured_output_private()
{
    let mut plan = base_plan();
    let llm = plan
        .nodes
        .get_mut("node-llm")
        .expect("llm node should exist");
    llm.config = json!({
        "model_provider": {
            "provider_instance_id": "provider-ready",
            "model_id": "gpt-5.4-mini"
        },
        "llm_parameters": {
            "schema_version": "1.0.0",
            "items": {
                "temperature": { "enabled": true, "value": 0.7 },
                "top_p": { "enabled": false, "value": 0.9 }
            }
        },
        "response_format": {
            "mode": "json_schema",
            "schema": { "type": "object" }
        }
    });

    let invoker = StubProviderInvoker {
        fail: false,
        captured_input: Arc::new(Mutex::new(None)),
        final_content: "{\"ok\":true}".to_string(),
    };

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "输出 JSON" } }),
        &invoker,
    )
    .await
    .unwrap();

    let captured_input = invoker
        .captured_input
        .lock()
        .expect("captured input mutex poisoned")
        .clone()
        .expect("provider input should be captured");

    assert_eq!(
        captured_input.model_parameters.get("temperature"),
        Some(&json!(0.7))
    );
    assert!(!captured_input.model_parameters.contains_key("top_p"));
    assert_eq!(
        captured_input.response_format,
        Some(json!({ "mode": "json_schema", "schema": { "type": "object" } }))
    );
    assert_eq!(
        outcome.node_traces[1].output_payload["text"],
        json!("{\"ok\":true}")
    );
    assert!(outcome.node_traces[1]
        .output_payload
        .get("structured_output")
        .is_none());
}

#[tokio::test]
async fn llm_json_schema_response_exposes_structured_output_only_when_declared() {
    let mut plan = base_plan();
    let llm = plan
        .nodes
        .get_mut("node-llm")
        .expect("llm node should exist");
    llm.config = json!({
        "model_provider": {
            "provider_instance_id": "provider-ready",
            "model_id": "gpt-5.4-mini"
        },
        "response_format": {
            "mode": "json_schema",
            "schema": { "type": "object" }
        }
    });
    llm.outputs.push(CompiledOutput {
        key: "structured_output".to_string(),
        title: "结构化输出".to_string(),
        value_type: "json".to_string(),
        selector: Vec::new(),
    });

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "输出 JSON" } }),
        &StubProviderInvoker {
            fail: false,
            captured_input: Arc::new(Mutex::new(None)),
            final_content: "{\"ok\":true}".to_string(),
        },
    )
    .await
    .unwrap();

    assert_eq!(
        outcome.node_traces[1].output_payload["text"],
        json!("{\"ok\":true}")
    );
    assert_eq!(
        outcome.node_traces[1].output_payload["structured_output"],
        json!({ "ok": true })
    );
    assert_eq!(
        outcome.node_traces[1].metrics_payload["usage"]["total_tokens"],
        json!(12)
    );
}

#[tokio::test]
async fn plugin_node_routes_to_capability_runtime_and_preserves_output_payload() {
    let plan = plugin_plan();

    let outcome = start_flow_debug_run(
        &plan,
        &json!({ "node-start": { "query": "world" } }),
        &successful_invoker(),
    )
    .await
    .unwrap();

    assert!(matches!(
        outcome.stop_reason,
        ExecutionStopReason::Completed
    ));
    assert_eq!(outcome.node_traces[1].node_type, "plugin_node");
    assert_eq!(outcome.node_traces[1].output_payload["answer"], "world");
}

#[tokio::test]
async fn plugin_node_keeps_executor_output_keys_outside_compiled_contract_hidden_from_variable_pool(
) {
    let outcome = start_flow_debug_run(
        &plugin_plan(),
        &json!({ "node-start": { "query": "world" } }),
        &UnknownCapabilityOutputInvoker,
    )
    .await
    .unwrap();

    assert_eq!(
        outcome.node_traces[1].output_payload["unexpected"],
        json!(true)
    );
    assert!(outcome.variable_pool["node-plugin"]
        .get("unexpected")
        .is_none());
}

#[tokio::test]
async fn plugin_node_keeps_runtime_named_executor_output_keys_hidden_from_variable_pool() {
    let outcome = start_flow_debug_run(
        &plugin_plan(),
        &json!({ "node-start": { "query": "world" } }),
        &ReservedCapabilityOutputInvoker,
    )
    .await
    .unwrap();

    assert_eq!(
        outcome.node_traces[1].output_payload["metadata"]["secret"],
        json!("x")
    );
    assert!(outcome.variable_pool["node-plugin"]
        .get("metadata")
        .is_none());
}
