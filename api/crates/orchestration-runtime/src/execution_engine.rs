use std::collections::BTreeMap;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use plugin_framework::{
    error::PluginFrameworkError,
    provider_contract::{
        ProviderFinishReason, ProviderInvocationInput, ProviderInvocationResult, ProviderMessage,
        ProviderMessageRole, ProviderRuntimeError, ProviderStreamEvent, ProviderUsage,
    },
};
use serde_json::{json, Map, Value};

use crate::{
    binding_runtime::{render_templated_bindings, resolve_node_inputs},
    compiled_plan::{CompiledLlmRuntime, CompiledNode, CompiledPlan},
    execution_state::{
        CheckpointSnapshot, ExecutionStopReason, FlowDebugExecutionOutcome, NodeExecutionFailure,
        NodeExecutionTrace, PendingCallbackTask, PendingHumanInput,
    },
};

#[derive(Debug, Clone, PartialEq)]
pub struct ProviderInvocationOutput {
    pub events: Vec<ProviderStreamEvent>,
    pub result: ProviderInvocationResult,
}

#[async_trait]
pub trait ProviderInvoker: Send + Sync {
    async fn invoke_llm(
        &self,
        runtime: &CompiledLlmRuntime,
        input: ProviderInvocationInput,
    ) -> Result<ProviderInvocationOutput>;
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LlmNodeExecution {
    pub output_payload: Value,
    pub error_payload: Option<Value>,
    pub metrics_payload: Value,
    pub provider_events: Vec<ProviderStreamEvent>,
}

pub async fn start_flow_debug_run<I>(
    plan: &CompiledPlan,
    input_payload: &Value,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + ?Sized,
{
    let variable_pool = input_payload
        .as_object()
        .cloned()
        .ok_or_else(|| anyhow!("input payload must be an object"))?;

    execute_from(plan, 0, variable_pool, invoker).await
}

pub async fn resume_flow_debug_run<I>(
    plan: &CompiledPlan,
    checkpoint: &CheckpointSnapshot,
    resume_payload: &Value,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + ?Sized,
{
    let patch = resume_payload
        .as_object()
        .ok_or_else(|| anyhow!("resume payload must be an object"))?;
    let mut variable_pool = checkpoint.variable_pool.clone();

    for (node_id, payload) in patch {
        variable_pool.insert(node_id.clone(), payload.clone());
    }

    execute_from(plan, checkpoint.next_node_index, variable_pool, invoker).await
}

async fn execute_from<I>(
    plan: &CompiledPlan,
    next_node_index: usize,
    mut variable_pool: Map<String, Value>,
    invoker: &I,
) -> Result<FlowDebugExecutionOutcome>
where
    I: ProviderInvoker + ?Sized,
{
    let mut node_traces = Vec::new();

    for (index, node_id) in plan
        .topological_order
        .iter()
        .enumerate()
        .skip(next_node_index)
    {
        let node = plan
            .nodes
            .get(node_id)
            .ok_or_else(|| anyhow!("compiled node missing: {node_id}"))?;
        let resolved_inputs = resolve_node_inputs(node, &variable_pool)?;
        let rendered_templates = render_templated_bindings(node, &resolved_inputs);

        match node.node_type.as_str() {
            "start" => {
                let payload = variable_pool
                    .get(node_id)
                    .cloned()
                    .unwrap_or_else(|| json!({}));
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: json!({}),
                    output_payload: payload,
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true }),
                    provider_events: Vec::new(),
                });
            }
            "llm" => {
                let execution =
                    execute_llm_node(node, &resolved_inputs, &rendered_templates, invoker).await?;
                let trace = NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: execution.output_payload.clone(),
                    error_payload: execution.error_payload.clone(),
                    metrics_payload: execution.metrics_payload.clone(),
                    provider_events: execution.provider_events.clone(),
                };
                node_traces.push(trace);

                if let Some(error_payload) = execution.error_payload {
                    return Ok(FlowDebugExecutionOutcome {
                        stop_reason: ExecutionStopReason::Failed(NodeExecutionFailure {
                            node_id: node.node_id.clone(),
                            node_alias: node.alias.clone(),
                            error_payload,
                        }),
                        variable_pool,
                        checkpoint_snapshot: None,
                        node_traces,
                    });
                }

                variable_pool.insert(node.node_id.clone(), execution.output_payload);
            }
            "template_transform" | "answer" => {
                let output_key = first_output_key(node);
                let output_value =
                    rendered_templates
                        .values()
                        .next()
                        .cloned()
                        .unwrap_or_else(|| {
                            resolved_inputs
                                .values()
                                .next()
                                .cloned()
                                .unwrap_or(Value::Null)
                        });
                let output_payload = json!({ output_key: output_value });
                variable_pool.insert(node.node_id.clone(), output_payload.clone());
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload,
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true }),
                    provider_events: Vec::new(),
                });
            }
            "human_input" => {
                let prompt = rendered_templates
                    .get("prompt")
                    .and_then(Value::as_str)
                    .unwrap_or("请提供人工输入")
                    .to_string();
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs),
                    output_payload: json!({}),
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true, "waiting": "human_input" }),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingHuman(PendingHumanInput {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        prompt,
                    }),
                    variable_pool: variable_pool.clone(),
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool,
                    }),
                    node_traces,
                });
            }
            "tool" | "http_request" => {
                node_traces.push(NodeExecutionTrace {
                    node_id: node.node_id.clone(),
                    node_type: node.node_type.clone(),
                    node_alias: node.alias.clone(),
                    input_payload: Value::Object(resolved_inputs.clone()),
                    output_payload: json!({}),
                    error_payload: None,
                    metrics_payload: json!({ "preview_mode": true, "waiting": node.node_type }),
                    provider_events: Vec::new(),
                });
                return Ok(FlowDebugExecutionOutcome {
                    stop_reason: ExecutionStopReason::WaitingCallback(PendingCallbackTask {
                        node_id: node.node_id.clone(),
                        node_alias: node.alias.clone(),
                        callback_kind: node.node_type.clone(),
                        request_payload: Value::Object(resolved_inputs),
                    }),
                    variable_pool: variable_pool.clone(),
                    checkpoint_snapshot: Some(CheckpointSnapshot {
                        next_node_index: index + 1,
                        variable_pool,
                    }),
                    node_traces,
                });
            }
            other => return Err(anyhow!("unsupported debug node type: {other}")),
        }
    }

    Ok(FlowDebugExecutionOutcome {
        stop_reason: ExecutionStopReason::Completed,
        variable_pool,
        checkpoint_snapshot: None,
        node_traces,
    })
}

pub(crate) async fn execute_llm_node<I>(
    node: &CompiledNode,
    resolved_inputs: &Map<String, Value>,
    rendered_templates: &Map<String, Value>,
    invoker: &I,
) -> Result<LlmNodeExecution>
where
    I: ProviderInvoker + ?Sized,
{
    let runtime = node.llm_runtime.as_ref().ok_or_else(|| {
        anyhow!(
            "compiled llm node is missing runtime metadata: {}",
            node.node_id
        )
    })?;
    let invocation_input =
        build_provider_invocation_input(node, runtime, resolved_inputs, rendered_templates);
    let output = match invoker.invoke_llm(runtime, invocation_input).await {
        Ok(output) => output,
        Err(error) => {
            let provider_error = provider_runtime_error_from_anyhow(&error);
            return Ok(LlmNodeExecution {
                output_payload: json!({ first_output_key(node): Value::Null }),
                error_payload: Some(build_provider_error_payload(runtime, &provider_error)),
                metrics_payload: json!({
                    "provider_instance_id": runtime.provider_instance_id,
                    "provider_code": runtime.provider_code,
                    "protocol": runtime.protocol,
                    "event_count": 0,
                    "usage": serde_json::to_value(ProviderUsage::default()).unwrap_or(Value::Null),
                    "finish_reason": "error",
                }),
                provider_events: Vec::new(),
            });
        }
    };

    let usage = collect_usage(&output.events, &output.result.usage);
    let finish_reason = output
        .result
        .finish_reason
        .clone()
        .or_else(|| finish_reason_from_events(&output.events));
    let final_content = output
        .result
        .final_content
        .clone()
        .or_else(|| collect_text_deltas(&output.events));
    let output_payload =
        build_llm_output_payload(node, &output.result, final_content, finish_reason.clone());
    let metrics_payload = json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "event_count": output.events.len(),
        "usage": serde_json::to_value(&usage).unwrap_or(Value::Null),
        "finish_reason": finish_reason
            .as_ref()
            .map(|reason| serde_json::to_value(reason).unwrap_or(Value::Null))
            .unwrap_or(Value::Null),
    });
    let provider_error = first_provider_error(&output.events).cloned().or_else(|| {
        matches!(finish_reason, Some(ProviderFinishReason::Error)).then(|| {
            ProviderRuntimeError::normalize(
                "invoke",
                "provider invocation finished with error",
                None,
            )
        })
    });

    Ok(LlmNodeExecution {
        output_payload,
        error_payload: provider_error
            .as_ref()
            .map(|error| build_provider_error_payload(runtime, error)),
        metrics_payload,
        provider_events: output.events,
    })
}

fn build_provider_invocation_input(
    node: &CompiledNode,
    runtime: &CompiledLlmRuntime,
    resolved_inputs: &Map<String, Value>,
    rendered_templates: &Map<String, Value>,
) -> ProviderInvocationInput {
    let system = binding_text(rendered_templates, resolved_inputs, "system_prompt");
    let messages = binding_text(rendered_templates, resolved_inputs, "user_prompt")
        .map(|content| {
            vec![ProviderMessage {
                role: ProviderMessageRole::User,
                content,
            }]
        })
        .unwrap_or_default();

    let trace_context = BTreeMap::from([
        ("node_id".to_string(), node.node_id.clone()),
        ("node_alias".to_string(), node.alias.clone()),
    ]);

    ProviderInvocationInput {
        provider_instance_id: runtime.provider_instance_id.clone(),
        provider_code: runtime.provider_code.clone(),
        protocol: runtime.protocol.clone(),
        model: runtime.model.clone(),
        provider_config: Value::Null,
        messages,
        system,
        tools: Vec::new(),
        mcp_bindings: Vec::new(),
        response_format: node.config.get("response_format").cloned(),
        model_parameters: build_model_parameters(&node.config),
        trace_context,
        run_context: BTreeMap::from([(
            "resolved_inputs".to_string(),
            Value::Object(resolved_inputs.clone()),
        )]),
    }
}

fn binding_text(
    rendered_templates: &Map<String, Value>,
    resolved_inputs: &Map<String, Value>,
    key: &str,
) -> Option<String> {
    rendered_templates
        .get(key)
        .or_else(|| resolved_inputs.get(key))
        .and_then(value_to_text)
}

fn value_to_text(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(text) => Some(text.clone()),
        other => Some(other.to_string()),
    }
}

fn build_model_parameters(config: &Value) -> BTreeMap<String, Value> {
    if let Some(items) = config
        .get("llm_parameters")
        .and_then(Value::as_object)
        .and_then(|value| value.get("items"))
        .and_then(Value::as_object)
    {
        return items
            .iter()
            .filter_map(|(key, item)| {
                let enabled = item
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let value = item.get("value").cloned().unwrap_or(Value::Null);
                enabled.then_some((key.clone(), value))
            })
            .collect();
    }

    [
        "temperature",
        "top_p",
        "presence_penalty",
        "frequency_penalty",
        "max_tokens",
        "seed",
    ]
    .into_iter()
    .filter_map(|key| {
        config
            .get(key)
            .cloned()
            .map(|value| (key.to_string(), value))
    })
    .collect()
}

fn first_output_key(node: &CompiledNode) -> String {
    node.outputs
        .first()
        .map(|output| output.key.clone())
        .unwrap_or_else(|| "result".to_string())
}

fn build_llm_output_payload(
    node: &CompiledNode,
    result: &ProviderInvocationResult,
    final_content: Option<String>,
    finish_reason: Option<ProviderFinishReason>,
) -> Value {
    let mut output = Map::new();
    output.insert(
        first_output_key(node),
        final_content.map(Value::String).unwrap_or(Value::Null),
    );
    if !result.tool_calls.is_empty() {
        output.insert(
            "tool_calls".to_string(),
            serde_json::to_value(&result.tool_calls).unwrap_or(Value::Null),
        );
    }
    if !result.mcp_calls.is_empty() {
        output.insert(
            "mcp_calls".to_string(),
            serde_json::to_value(&result.mcp_calls).unwrap_or(Value::Null),
        );
    }
    if !result.provider_metadata.is_null() {
        output.insert(
            "provider_metadata".to_string(),
            result.provider_metadata.clone(),
        );
    }
    if let Some(reason) = finish_reason {
        output.insert(
            "finish_reason".to_string(),
            serde_json::to_value(reason).unwrap_or(Value::Null),
        );
    }
    Value::Object(output)
}

fn collect_text_deltas(events: &[ProviderStreamEvent]) -> Option<String> {
    let mut content = String::new();
    for event in events {
        if let ProviderStreamEvent::TextDelta { delta } = event {
            content.push_str(delta);
        }
    }
    (!content.is_empty()).then_some(content)
}

fn collect_usage(events: &[ProviderStreamEvent], result_usage: &ProviderUsage) -> ProviderUsage {
    let mut usage = result_usage.clone();
    for event in events {
        match event {
            ProviderStreamEvent::UsageSnapshot { usage: snapshot } => {
                usage = snapshot.clone();
            }
            ProviderStreamEvent::UsageDelta { usage: delta } => {
                apply_usage_delta(&mut usage, delta)
            }
            _ => {}
        }
    }
    usage
}

fn apply_usage_delta(target: &mut ProviderUsage, delta: &ProviderUsage) {
    add_usage_value(&mut target.input_tokens, delta.input_tokens);
    add_usage_value(&mut target.output_tokens, delta.output_tokens);
    add_usage_value(&mut target.reasoning_tokens, delta.reasoning_tokens);
    add_usage_value(&mut target.cache_read_tokens, delta.cache_read_tokens);
    add_usage_value(&mut target.cache_write_tokens, delta.cache_write_tokens);
    add_usage_value(&mut target.total_tokens, delta.total_tokens);
}

fn add_usage_value(target: &mut Option<u64>, delta: Option<u64>) {
    if let Some(delta) = delta {
        *target = Some(target.unwrap_or_default() + delta);
    }
}

fn finish_reason_from_events(events: &[ProviderStreamEvent]) -> Option<ProviderFinishReason> {
    events.iter().rev().find_map(|event| match event {
        ProviderStreamEvent::Finish { reason } => Some(reason.clone()),
        _ => None,
    })
}

fn first_provider_error(events: &[ProviderStreamEvent]) -> Option<&ProviderRuntimeError> {
    events.iter().find_map(|event| match event {
        ProviderStreamEvent::Error { error } => Some(error),
        _ => None,
    })
}

fn build_provider_error_payload(
    runtime: &CompiledLlmRuntime,
    error: &ProviderRuntimeError,
) -> Value {
    json!({
        "provider_instance_id": runtime.provider_instance_id,
        "provider_code": runtime.provider_code,
        "protocol": runtime.protocol,
        "error_kind": serde_json::to_value(error.kind).unwrap_or(Value::Null),
        "message": sanitize_diagnostic_text(&error.message),
        "provider_summary": error
            .provider_summary
            .as_deref()
            .map(sanitize_diagnostic_text),
    })
}

fn provider_runtime_error_from_anyhow(error: &anyhow::Error) -> ProviderRuntimeError {
    if let Some(PluginFrameworkError::RuntimeContract { error }) =
        error.downcast_ref::<PluginFrameworkError>()
    {
        return error.clone();
    }

    ProviderRuntimeError::normalize("invoke", error.to_string(), None)
}

fn sanitize_diagnostic_text(text: &str) -> String {
    let mut sanitized = text.to_string();
    for marker in [
        "bearer ",
        "authorization:",
        "\"authorization\":\"",
        "api_key=",
        "api_key:",
        "\"api_key\":\"",
        "token=",
        "secret=",
        "\"secret\":\"",
    ] {
        sanitized = redact_marker_value(&sanitized, marker);
    }
    sanitized = redact_prefixed_token(&sanitized, "sk-");
    let sanitized = sanitized.trim();
    if sanitized.chars().count() <= 240 {
        sanitized.to_string()
    } else {
        format!("{}...", sanitized.chars().take(240).collect::<String>())
    }
}

fn redact_marker_value(text: &str, marker: &str) -> String {
    let haystack = text.to_ascii_lowercase();
    let needle = marker.to_ascii_lowercase();
    let mut result = String::with_capacity(text.len());
    let mut cursor = 0;

    while let Some(offset) = haystack[cursor..].find(&needle) {
        let start = cursor + offset;
        let value_start = start + marker.len();
        result.push_str(&text[cursor..value_start]);
        let mut value_end = value_start;
        for ch in text[value_start..].chars() {
            if ch.is_whitespace() || matches!(ch, '"' | '\'' | ',' | '}' | ']' | '\n' | '\r') {
                break;
            }
            value_end += ch.len_utf8();
        }
        if value_end > value_start {
            result.push_str("[REDACTED]");
        }
        cursor = value_end;
    }

    result.push_str(&text[cursor..]);
    result
}

fn redact_prefixed_token(text: &str, prefix: &str) -> String {
    let haystack = text.to_ascii_lowercase();
    let needle = prefix.to_ascii_lowercase();
    let mut result = String::with_capacity(text.len());
    let mut cursor = 0;

    while let Some(offset) = haystack[cursor..].find(&needle) {
        let start = cursor + offset;
        result.push_str(&text[cursor..start]);
        result.push_str(prefix);
        result.push_str("[REDACTED]");
        let mut token_end = start + prefix.len();
        for ch in text[token_end..].chars() {
            if !(ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.')) {
                break;
            }
            token_end += ch.len_utf8();
        }
        cursor = token_end;
    }

    result.push_str(&text[cursor..]);
    result
}
